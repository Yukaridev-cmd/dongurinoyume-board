import { recordsApi } from './records.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function configuration(env) {
  try {
    const members = JSON.parse(env.LINE_MEMBERS);
    const ids = Object.keys(members);
    if (ids.length !== 2 || !ids.every(id => /^U[0-9a-f]{32}$/.test(id)) ||
        !ids.every(id => typeof members[id] === 'string' && members[id].trim() && members[id].length <= 40) ||
        new Set(Object.values(members)).size !== 2 || !/^\d+$/.test(env.LINE_CHANNEL_ID) ||
        new URL(env.ALLOWED_ORIGIN).origin !== env.ALLOWED_ORIGIN ||
        !env.ALLOWED_ORIGIN.startsWith('https://') || !env.DB) throw Error();
    return members;
  } catch { throw new HttpError(503, 'コメントの共有設定を確認中'); }
}
async function authenticate(request, env, members, fetcher) {
  const bearer = request.headers.get('Authorization') || '';
  if (!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(bearer)) throw new HttpError(401, 'LINEからログイン');
  let response;
  try {
    response = await fetcher('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: bearer.slice(7), client_id: env.LINE_CHANNEL_ID }),
      signal: AbortSignal.timeout(8000)
    });
  } catch { throw new HttpError(503, 'LINE認証を確認できず。時間をおいて再試行'); }
  if (response.status >= 500 || response.status === 429) throw new HttpError(503, 'LINE認証を確認できず。時間をおいて再試行');
  if (!response.ok) throw new HttpError(401, 'LINEからログインし直す');
  let claims;
  try { claims = await response.json(); } catch { throw new HttpError(503, 'LINE認証を確認できず'); }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== 'https://access.line.me' || claims.aud !== env.LINE_CHANNEL_ID ||
      !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      typeof claims.sub !== 'string') throw new HttpError(401, 'LINEからログインし直す');
  if (!Object.hasOwn(members, claims.sub)) throw new HttpError(403, 'このLINEアカウントは共有対象外');
  return { id: claims.sub, name: members[claims.sub] };
}
async function readBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'JSON形式で送信');
  // Bound bytes before parsing, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '入力を確認');
  const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20000) { await reader.cancel(); throw new HttpError(413, 'コメントは4000文字以内で記入'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw Error();
    return body;
  } catch { throw new HttpError(400, '入力を確認'); }
}
function field(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, '入力文字数を確認');
  return value.trim();
}
function present(row, user, members) {
  return { id: row.id, target: row.target, text: row.text, author: members[row.owner] || '共有メンバー',
    stamp: row.created_at, version: row.version, canEdit: row.owner === user.id };
}
const routeRecords = recordsApi({ HttpError, UUID, readBody, field });
export function createHandler(fetcher = fetch) {
  return async function handle(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private',
      'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (origin && origin === env.ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (origin !== env.ALLOWED_ORIGIN) throw new HttpError(403, '共有ページから開く');
      const members = configuration(env);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...headers,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } });
      }
      const url = new URL(request.url);
      const match = url.pathname.match(/^\/comments\/([0-9a-f-]+)$/i);
      const isRecord = url.pathname === '/records' || /^\/records\/[0-9a-f-]+$/i.test(url.pathname);
      if (url.pathname !== '/session' && url.pathname !== '/comments' && !match && !isRecord) throw new HttpError(404, '対象なし');
      const user = await authenticate(request, env, members, fetcher);
      if (isRecord) return await routeRecords(request, url, env, user, members, json);
      if (url.pathname === '/session' && request.method === 'GET') {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.LINE_CHANNEL_ID + ':' + user.id));
        const viewer = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        return json({ author: user.name, viewer });
      }
      if (url.pathname === '/comments' && request.method === 'GET') {
        const cursor = url.searchParams.get('cursor') || '';
        if (cursor && !UUID.test(cursor)) throw new HttpError(400, '取得位置を確認');
        const result = await env.DB.prepare('SELECT * FROM comments WHERE deleted = 0 AND id > ? ORDER BY id LIMIT 101').bind(cursor).all();
        const rows = result.results.slice(0, 100);
        return json({ comments: rows.map(row => present(row, user, members)), next: result.results.length > 100 ? rows.at(-1).id : null });
      }
      if (url.pathname === '/comments' && request.method === 'POST') {
        const body = await readBody(request);
        if (!UUID.test(body.id)) throw new HttpError(400, '投稿番号を確認');
        const target = field(body.target, 300), text = field(body.text, 4000);
        await env.DB.prepare('INSERT INTO comments (id, owner, target, text, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(body.id, user.id, target, text, new Date().toISOString()).run();
        const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(body.id).first();
        if (row.owner !== user.id || row.deleted || row.target !== target || row.text !== text) throw new HttpError(409, '投稿番号が競合。再読込後に確認');
        return json({ comment: present(row, user, members) }, 201);
      }
      if (match && UUID.test(match[1]) && ['PATCH', 'DELETE'].includes(request.method)) {
        const body = await readBody(request);
        if (!Number.isSafeInteger(body.version) || body.version < 1) throw new HttpError(400, '更新番号を確認');
        const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ? AND deleted = 0').bind(match[1]).first();
        if (!row) throw new HttpError(404, 'コメントなし。再読込して確認');
        if (row.owner !== user.id) throw new HttpError(403, '自分のコメントだけ変更可能');
        const statement = request.method === 'PATCH'
          ? env.DB.prepare('UPDATE comments SET text = ?, version = version + 1 WHERE id = ? AND owner = ? AND version = ? AND deleted = 0').bind(field(body.text, 4000), row.id, user.id, body.version)
          : env.DB.prepare('UPDATE comments SET deleted = 1, version = version + 1 WHERE id = ? AND owner = ? AND version = ? AND deleted = 0').bind(row.id, user.id, body.version);
        const result = await statement.run();
        if (result.meta.changes !== 1) throw new HttpError(409, '他の画面で変更済み。再読込して確認');
        if (request.method === 'DELETE') return json({ deleted: true });
        const updated = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(row.id).first();
        return json({ comment: present(updated, user, members) });
      }
      throw new HttpError(405, '操作対象を確認');
    } catch (error) {
      // Never log request headers, tokens, user IDs or comment bodies.
      return json({ error: error instanceof HttpError ? error.message : '保存先に接続できず。入力を残して再試行' }, error instanceof HttpError ? error.status : 503);
    }
  };
}
export default { fetch: createHandler() };
