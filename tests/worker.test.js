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
  sqlite.exec(readFileSync(new URL('../backend/records-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../backend/events-schema.sql', import.meta.url), 'utf8'));
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

test('session draft identity is server verified, stable across label changes, distinct for members and contains no LINE subject',async()=>{
  const f=fixture();const a=await(await f.request('/session')).json();assert.match(a.viewer,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(a).includes(first));
  f.env.LINE_MEMBERS=JSON.stringify({[first]:'changed label',[second]:'other label'});
  assert.equal((await(await f.request('/session')).json()).viewer,a.viewer);
  f.subject=second;const b=await(await f.request('/session')).json();assert.notEqual(b.viewer,a.viewer);assert.ok(!JSON.stringify(b).includes(second));
  f.subject=outsider;assert.equal((await f.request('/session')).status,403);
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
test('private records reject unknown identities and keep missing amounts distinct from zero', async () => {
  const f = fixture();
  assert.equal((await f.request('/records', 'GET', undefined, { Authorization: '' })).status, 401);
  f.subject = outsider;
  assert.equal((await f.request('/records')).status, 403);
  assert.equal((await f.request('/records','POST',{id,kind:'review',data:{title:'架空の振り返り',salesYen:0}})).status,403);
  f.subject = first;
  const response = await f.request('/records','POST',{id,kind:'review',data:{title:'架空の振り返り',salesYen:0,costsYen:null,notes:'テスト用の本文'}});
  assert.equal(response.status,201);
  const row=(await response.json()).record;
  assert.equal(row.data.salesYen,0);assert.equal(row.data.costsYen,null);
  assert.equal('owner' in row,false);assert.equal(row.author,'本人');
  f.subject=second;
  assert.equal((await (await f.request('/records')).json()).records[0].data.salesYen,0);
  assert.equal((await f.request('/records/'+id,'PATCH',{version:1,data:{title:'上書き'}})).status,403);
  assert.equal((await f.request('/records/'+id,'DELETE',{version:1})).status,403);
});
test('shared tasks support either member, optimistic updates and preserved prior versions', async () => {
  const f=fixture();
  const body={id,kind:'task',data:{title:'テストのやること',status:'未着手',dueDate:'2026-12-01',notes:'元の内容'}};
  assert.equal((await f.request('/records','POST',body)).status,201);
  assert.equal((await f.request('/records','POST',body)).status,201);
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);
  assert.equal((await f.request('/records','POST',{...body,data:{...body.data,notes:'違う内容'}})).status,409);
  f.subject=second;
  const changed=await f.request('/records/'+id,'PATCH',{version:1,data:{...body.data,status:'完了'}});
  assert.equal(changed.status,200);assert.equal((await changed.json()).record.updatedBy,'妻');
  assert.equal((await f.request('/records/'+id,'PATCH',{version:1,data:body.data})).status,409);
  const history=f.db.sqlite.prepare('SELECT * FROM record_history WHERE record_id = ?').get(id);
  assert.equal(JSON.parse(history.data).status,'未着手');assert.equal(history.version,1);
  assert.equal((await f.request('/records/'+id,'DELETE',{version:2})).status,200);
  assert.equal((await (await f.request('/records')).json()).records.length,0);
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM record_history').get().n,2);
});
test('record kinds validate integers, dates, photo paths and allowed states; inventory remains a source reconciliation note', async () => {
  const f=fixture();
  const invalid=[
    {kind:'other',data:{title:'x'}},
    {kind:'review',data:{title:'x',salesYen:-1}},
    {kind:'review',data:{title:'x',salesYen:'0'}},
    {kind:'review',data:{title:'x',salesYen:1.5}},
    {kind:'review',data:{title:'x',date:'2026-02-30'}},
    {kind:'task',data:{title:'x',status:'unknown'}},
    {kind:'inventory',data:{title:'x',stock:-1,status:'未確認'}},
    {kind:'photo',data:{title:'x',status:'確認済み',asset:'https://attacker.example/track.jpg'}},
    {kind:'photo',data:{title:'x',status:'確認済み',asset:'assets/../private.jpg'}},
    {kind:'request',data:{title:'x',status:'未対応',notes:'x'.repeat(4001)}}
  ];
  for(const body of invalid)assert.equal((await f.request('/records','POST',{id,...body})).status,400);
  assert.equal((await f.request('/records','POST',{id,kind:'inventory',data:{title:'架空の作品',status:'未確認',stock:null,source:'自動反映済み'}})).status,201);
  const row=(await (await f.request('/records')).json()).records[0];
  assert.equal(row.data.stock,null);assert.equal(row.data.source,'棚卸メモ・更新シート未反映');
});
test('records survive store reopen without being inserted into the public comment stream', async () => {
  const dir=mkdtempSync(join(tmpdir(),'donguri-record-test-')),path=join(dir,'private.sqlite');let db=database(path);
  try{
    assert.equal((await fixture(db).request('/records','POST',{id,kind:'review',data:{title:'架空の記録',salesYen:1234}})).status,201);
    db.sqlite.close();db=database(path);const f=fixture(db);f.subject=second;
    assert.equal((await (await f.request('/records')).json()).records[0].data.salesYen,1234);
    assert.equal((await (await f.request('/comments')).json()).comments.length,0);
  }finally{db.sqlite.close();rmSync(path);rmdirSync(dir);}
});
test('event associations are explicit, validated, versioned and removable without migrating old records',async()=>{
 const f=fixture(),data={title:'架空の準備',status:'未着手',eventId:'event-xmas'};
 for(const eventId of ['unknown','https://attacker.example',{},null])assert.equal((await f.request('/records','POST',{id,kind:'task',data:{...data,eventId}})).status,400);
 let saved=await (await f.request('/records','POST',{id,kind:'task',data})).json();assert.equal(saved.record.data.eventId,'event-xmas');
 saved=await (await f.request('/records/'+id,'PATCH',{version:1,data:{...data,eventId:''}})).json();assert.equal(saved.record.data.eventId,'');
 assert.equal(JSON.parse(f.db.sqlite.prepare('SELECT data FROM record_history WHERE record_id=?').get(id).data).eventId,'event-xmas');
 const legacy='22222222-2222-4222-8222-222222222222';await f.request('/records','POST',{id:legacy,kind:'review',data:{title:'未分類の記録'}});
 const rows=(await (await f.request('/records')).json()).records;assert.equal(Object.hasOwn(rows.find(r=>r.id===legacy).data,'eventId'),false);
 assert.equal((await (await f.request('/comments')).json()).comments.length,0);
});
test('new private events and selections require membership, persist once, and retain shared edit history',async()=>{
 const f=fixture(),data={title:'架空の出店',date:'2026-12-20',start:'10:00',end:'16:00',venue:'テスト会場',notes:'非公開テスト',products:['work-haniwa'],pops:['pop-haniwa']};
 f.subject=outsider;assert.equal((await f.request('/events/'+id,'POST',{version:0,data})).status,403);assert.equal((await f.request('/events')).status,403);f.subject=first;
 assert.equal((await f.request('/events/'+id,'POST',{version:0,data})).status,201);assert.equal((await f.request('/events/'+id,'POST',{version:0,data})).status,201);
 assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM event_plans').get().n,1);
 f.subject=second;let row=(await (await f.request('/events/'+id)).json()).event;assert.equal(row.data.products[0],'work-haniwa');assert.equal('owner' in row,false);
 const edited={...data,products:[],pops:[]};assert.equal((await f.request('/events/'+id,'POST',{version:1,data:edited})).status,200);assert.equal((await f.request('/events/'+id,'POST',{version:1,data:edited})).status,200);
 assert.equal((await f.request('/events/'+id,'POST',{version:1,data})).status,409);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM event_plan_history').get().n,1);
 const recordId='22222222-2222-4222-8222-222222222222';assert.equal((await f.request('/records','POST',{id:recordId,kind:'task',data:{title:'テスト準備',status:'未着手',eventId:id}})).status,201);
 assert.equal((await (await f.request('/comments')).json()).comments.length,0);assert.equal((await (await f.request('/events')).json()).events.length,1);
});
test('selection lists reject unknown or duplicate items, dates, and unsaved event associations',async()=>{
 const f=fixture(),data={title:'架空',products:[],pops:[]};
 for(const changed of [{products:['not-a-work']},{products:['work-haniwa','work-haniwa']},{pops:['https://attacker.example']},{date:'2026-02-30'},{start:'25:00'},{start:'16:00',end:'10:00'}])assert.equal((await f.request('/events/'+id,'POST',{version:0,data:{...data,...changed}})).status,400);
 assert.equal((await f.request('/records','POST',{id,kind:'task',data:{title:'架空',status:'未着手',eventId:id}})).status,400);
 assert.equal((await f.request('/events/event-xmas','POST',{version:0,data:{...data,title:'公開名の書換え',venue:'変更'}})).status,201);
 const event=(await (await f.request('/events/event-xmas')).json()).event;assert.equal(event.data.title,'クリスマスマルシェ（2026年12月）');assert.equal(event.data.venue,'');assert.equal(event.publicReference,true);
});

test('event plans and selected items survive database reopen with unclassified records untouched',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'donguri-event-test-')),path=join(dir,'private.sqlite');let db=database(path);try{let f=fixture(db);await f.request('/records','POST',{id,kind:'review',data:{title:'架空の未分類記録',salesYen:0,costsYen:null}});const data={title:'架空の出店',products:['work-haniwa'],pops:['pop-haniwa']};assert.equal((await f.request('/events/'+id,'POST',{version:0,data})).status,201);db.sqlite.close();db=database(path);f=fixture(db);f.subject=second;const row=(await(await f.request('/events/'+id)).json()).event;assert.deepEqual(row.data.products,data.products);assert.deepEqual(row.data.pops,data.pops);const record=(await(await f.request('/records')).json()).records[0];assert.equal(Object.hasOwn(record.data,'eventId'),false);assert.equal(record.data.salesYen,0);assert.equal(record.data.costsYen,null);}finally{db.sqlite.close();rmSync(path);rmdirSync(dir);}
});
