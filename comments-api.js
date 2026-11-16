(function () {
'use strict';
var config = window.DONGURI_COMMENTS_CONFIG || {};
var ready = false, author = '', flight = null, generation = 0;
var status = document.getElementById('comments-status');
var login = document.getElementById('comments-login');
function publish(message) {
  if (status) status.textContent = message;
  window.dispatchEvent(new CustomEvent('comments-auth', { detail: { ready: ready, author: author } }));
}
function lock(message) {
  generation++;
  ready = false; author = '';
  window.dispatchEvent(new CustomEvent('comments-clear'));
  publish(message);
}
async function request(path, method, body) {
  var token = window.liff && window.liff.getIDToken();
  if (!token) { lock('LINEからログインし直す'); throw new Error('LINEからログインし直す'); }
  var response;
  try {
    response = await fetch(config.apiBase + path, { method: method || 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch { throw new Error('通信を確認し、入力を残して再試行'); }
  var data;
  try { data = await response.json(); } catch { throw new Error('保存先の応答を確認できず'); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) lock(data.error || 'LINE認証を確認');
    throw new Error(data.error || '保存できず。入力を残して再試行');
  }
  return data;
}
async function connect() {
  if (flight) return flight;
  if (document.querySelector('[data-comment-editor], [data-private-dirty]')) { publish('入力を保存・取消してから再読込'); return; }
  var started = generation;
  flight = (async function () {
    try {
      if (!config.liffId || !config.apiBase) { lock('コメント共有の設定待ち。設定後にLINEから開く'); return; }
      var api = new URL(config.apiBase);
      if (api.protocol !== 'https:' || api.origin !== config.apiBase) throw new Error('コメント共有の接続設定を確認');
      if (!window.liff) throw new Error('LINEの読込に失敗。再読込して確認');
      ready = false;
      publish('LINE認証と保存済みコメントを確認中');
      await window.liff.init({ liffId: config.liffId });
      if (!window.liff.isInClient()) { lock('LINEで共有リンクを開く'); return; }
      if (!window.liff.isLoggedIn()) { lock('LINEからログイン'); return; }
      var session = await request('/session');
      author = session.author;
      var rows = [], cursor = '';
      do {
        var data = await request('/comments' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        rows = rows.concat(data.comments); cursor = data.next;
      } while (cursor);
      if (started !== generation || document.hidden) return;
      ready = true;
      window.dispatchEvent(new CustomEvent('comments-loaded', { detail: rows }));
      publish(author + 'として共有中。投稿・更新後に保存');
    } catch (error) { lock(error.message); }
    finally { flight = null; }
  })();
  return flight;
}
window.DonguriComments = {
  connect: connect,
  save: async function (path, method, body) {
    if (!ready) throw new Error('コメント共有の接続を確認');
    var started = generation;
    var data = await request(path, method, body);
    if (!ready || started !== generation) throw new Error('LINE認証を再確認して保存結果を再読込');
    return data;
  }
};
if (login) login.addEventListener('click', connect);
// Revalidate on return to LINE and periodically; an expired/revoked login clears memory and summaries.
document.addEventListener('visibilitychange', function () { if (document.hidden) lock('LINE認証を再確認'); else connect(); });
window.addEventListener('pagehide', function () { lock('LINE認証を再確認'); });
window.addEventListener('pageshow', function (event) { if (event.persisted) connect(); });
setInterval(async function () {
  if (document.hidden || !ready) return;
  try { await request('/session'); } catch (error) { lock(error.message); }
}, 60000);
connect();
})();
