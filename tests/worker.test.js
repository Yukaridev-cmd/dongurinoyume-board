import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '../backend/worker.js';

const first = 'U' + '1'.repeat(32), second = 'U' + '2'.repeat(32), outsider = 'U' + '3'.repeat(32);
const origin = 'https://yukaridev-cmd.github.io';
const id = '11111111-1111-4111-8111-111111111111';
function database(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec(readFileSync(new URL('../backend/schema.sql', import.meta.url), 'utf8'));
  return { sqlite, prepare(sql) {
    return { bind(...args) { const stmt = sqlite.prepare(sql); return {
      async run() { return { meta: { changes: Number(stmt.run(...args).changes) } }; },
      async first() { return stmt.get(...args) || null; },
      async all() { return { results: stmt.all(...args) }; }
    }; } };
  } };
}
function fixture(db = database()) {
  const env = { DB: db, ALLOWED_ORIGIN: origin, LINE_CHANNEL_ID: '123456', LINE_MEMBERS: JSON.stringify({ [first]: '本人', [second]: '妻' }) };
  let subject = first, calls = 0, upstream = null, override = {};
  const handle = createHandler(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
    assert.equal(options.body.get('client_id'), env.LINE_CHANNEL_ID);
    assert.equal(options.body.get('id_token'), 'signed.id.token');
    if (upstream === 'throw') throw Error('network failure');
    if (upstream) return new Response('{}', { status: upstream });
    return Response.json({ iss: 'https://access.line.me', aud: env.LINE_CHANNEL_ID, sub: subject,
      exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000), ...override });
  });
  return { db, env, get calls() { return calls; }, set subject(v) { subject = v; }, set upstream(v) { upstream = v; }, set override(v) { override = v; },
    request: (path = '/comments', method = 'GET', body, headers = {}) => handle(new Request('https://comments.example' + path, {
      method, headers: { Origin: origin, Authorization: 'Bearer signed.id.token', 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    }), env) };
}
test('configuration fails closed unless exactly two distinct users are explicitly configured', async () => {
  const f = fixture();
  for (const members of [undefined, '{}', '{bad', JSON.stringify({ [first]: '本人' }), JSON.stringify({ [first]: '本人', [second]: '本人' }), JSON.stringify({ [first]: '本人', [second]: '妻', [outsider]: '第三者' })]) {
    f.env.LINE_MEMBERS = members;
    assert.equal((await f.request()).status, 503);
  }
  assert.equal(f.calls, 0);
});
test('missing token, tampered, expired, wrong-channel and outsider tokens cannot read or write', async () => {
  const f = fixture();
  assert.equal((await f.request('/comments', 'GET', undefined, { Authorization: '' })).status, 401);
  f.upstream = 400;
  assert.equal((await f.request()).status, 401);
  f.upstream = null;
  for (const claims of [{ exp: 1 }, { aud: 'another-channel' }, { iss: 'https://attacker.example' }, { sub: null }, { iat: Date.now() }]) {
    f.override = claims; assert.equal((await f.request()).status, 401);
  }
  f.override = {}; f.subject = outsider;
  for (const [path, method, body] of [['/comments', 'GET'], ['/comments', 'POST', { id, target: '作品', text: '秘密' }], ['/comments/' + id, 'DELETE', { version: 1 }]]) {
    assert.equal((await f.request(path, method, body)).status, 403);
  }
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 0);
});
test('origin preflight and responses never permit arbitrary origins or caching', async () => {
  const f = fixture();
  const preflight = await f.request('/comments', 'OPTIONS');
  assert.equal(preflight.status, 204); assert.equal(f.calls, 0);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  for (const value of ['https://attacker.example', 'null', '']) {
    const response = await f.request('/comments', 'GET', undefined, { Origin: value });
    assert.equal(response.status, 403); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const response = await f.request();
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
});
test('both members share persistent comments; identity spoofing, other-person edits and lost updates are blocked', async () => {
  const f = fixture();
  const post = { id, target: '作品：テスト', text: '<img src=x onerror=alert(1)>', author: '偽名', owner: second };
  const response = await f.request('/comments', 'POST', post);
  assert.equal(response.status, 201);
  const { comment } = await response.json();
  assert.equal(comment.author, '本人'); assert.equal(comment.canEdit, true); assert.equal('owner' in comment, false);
  assert.equal((await f.request('/comments', 'POST', post)).status, 201);
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 1);
  assert.equal((await f.request('/comments', 'POST', { ...post, text: '別内容' })).status, 409);
  f.subject = second;
  const loaded = await (await f.request()).json();
  assert.equal(loaded.comments.length, 1); assert.equal(loaded.comments[0].canEdit, false);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await f.request('/comments/' + id, method, { text: '変更', version: 1 })).status, 403);
  f.subject = first;
  const changed = await f.request('/comments/' + id, 'PATCH', { version: 1, text: '更新' });
  assert.equal(changed.status, 200); assert.equal((await changed.json()).comment.version, 2);
  assert.equal((await f.request('/comments/' + id, 'PATCH', { version: 1, text: '古い画面' })).status, 409);
  assert.equal((await f.request('/comments/' + id, 'DELETE', { version: 1 })).status, 409);
  assert.equal((await f.request('/comments/' + id, 'DELETE', { version: 2 })).status, 200);
  assert.equal((await (await f.request()).json()).comments.length, 0);
  assert.equal(f.db.sqlite.prepare('SELECT deleted FROM comments').get().deleted, 1);
});
test('file database persists after closing and reopening the server store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'donguri-test-'));
  const path = join(dir, 'test.sqlite');
  let db = database(path);
  try {
    assert.equal((await fixture(db).request('/comments', 'POST', { id, target: 'ホーム', text: '再読込テスト' })).status, 201);
    db.sqlite.close(); db = database(path);
    const f = fixture(db); f.subject = second;
    assert.equal((await (await f.request()).json()).comments[0].text, '再読込テスト');
  } finally { db.sqlite.close(); rmSync(path); rmdirSync(dir); }
});
test('validates sizes, content type, malformed input and SQL injection as plain text', async () => {
  const f = fixture();
  for (const body of [null, [], { id: 'bad' }, { id, target: '', text: 'ok' }, { id, target: 'x'.repeat(301), text: 'ok' }, { id, target: 'ok', text: 'x'.repeat(4001) }]) {
    assert.equal((await f.request('/comments', 'POST', body)).status, 400);
  }
  assert.equal((await f.request('/comments', 'POST', { id }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.request('/comments', 'POST', { id, text: 'x'.repeat(21000) })).status, 413);
  assert.equal((await f.request('/comments?cursor=invalid')).status, 400);
  assert.equal((await f.request('/comments', 'POST', { id, target: "'); DROP TABLE comments;--", text: '引用文' })).status, 201);
  assert.equal((await (await f.request()).json()).comments.length, 1);
});
test('pagination returns all comments without duplicating the boundary', async () => {
  const f = fixture();
  for (let i = 0; i < 102; i++) {
    const key = i.toString(16).padStart(8, '0') + '-1111-4111-8111-111111111111';
    f.db.sqlite.prepare('INSERT INTO comments (id, owner, target, text, created_at) VALUES (?, ?, ?, ?, ?)').run(key, first, 'ページ', 'テスト', new Date().toISOString());
  }
  const page = await (await f.request()).json();
  assert.equal(page.comments.length, 100);
  const rest = await (await f.request('/comments?cursor=' + page.next)).json();
  assert.equal(rest.comments.length, 2); assert.equal(rest.next, null);
  assert.equal(new Set([...page.comments, ...rest.comments].map(c => c.id)).size, 102);
});
test('upstream and database failures return generic safe errors without private details', async () => {
  const f = fixture();
  for (const upstream of [500, 429, 'throw']) { f.upstream = upstream; assert.equal((await f.request()).status, 503); }
  f.upstream = null;
  f.env.DB = { prepare() { throw Error('SECRET DATABASE PASSWORD'); } };
  const response = await f.request();
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('SECRET'), false);
});
