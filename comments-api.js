(function () {
'use strict';
var config = window.DONGURI_COMMENTS_CONFIG || {};
var ready = false, author = '', viewer = '', sessionToken = '', flight = null, generation = 0, reconnectQueued = false;
var status = document.getElementById('comments-status');
var login = document.getElementById('comments-login');
var pausedMessage = '非公開の保存・閲覧は停止中（二人の設定待ち）。コメント・売上・在庫メモはまだ利用不可。';
if (config.paused === true) {
  if (login) { login.disabled = true; login.textContent = '二人の設定待ち'; }
  if (document.getElementById('quick-memo-btn')) {
    var pausedNotice = document.createElement('p'); pausedNotice.className = 'sharing-paused';
    pausedNotice.textContent = pausedMessage; document.querySelector('header').after(pausedNotice);
  }
}
function announce(message) { if (status) status.textContent = message; }
function publish(message) {
  announce(message);
  window.dispatchEvent(new CustomEvent('comments-auth', { detail: { ready: ready, author: ready ? author : '', viewer: ready ? viewer : '' } }));
}
function protect(message, eventName, reason) {
  generation++;
  ready = false; author = ''; viewer = ''; sessionToken = '';
  window.dispatchEvent(new CustomEvent(eventName, { detail: { reason: reason } }));
  publish(message);
}
function lock(message) { protect(message, 'comments-clear', 'authentication'); }
function suspend() { protect('入力をこのページ内で一時保護。戻ったらLINE認証を再確認', 'comments-suspend', 'background'); }
function failure(message, code) { var error = new Error(message); error.status = code || 0; return error; }
async function request(path, method, body) {
  var epoch = generation;
  var token = window.liff && window.liff.getIDToken();
  if (ready && token && token !== sessionToken) {
    lock('LINE認証の変更を確認。入力を保護して再確認');
    connect({ revalidate: true });
    throw failure('LINE認証を再確認後に保存結果を確認して再試行', 401);
  }
  if (!token) {
    if (epoch === generation) lock('LINEから再認証。未保存入力は同じアカウント確認後に復元');
    throw failure('LINEからログインし直す', 401);
  }
  var response;
  try {
    response = await fetch(config.apiBase + path, { method: method || 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch { throw failure('通信を確認し、入力を残して再試行'); }
  var data;
  try { data = await response.json(); } catch {
    if (epoch === generation && (response.status === 401 || response.status === 403)) lock('LINE認証を再確認。未保存入力は同じアカウント確認後に復元');
    throw failure('保存先の応答を確認できず。入力は保持', response.status);
  }
  if (!response.ok) {
    // A response from before suspension must not lock a newer verified session.
    if (epoch === generation && (response.status === 401 || response.status === 403)) {
      lock((data.error || 'LINE認証を確認') + '。未保存入力は同じアカウント確認後に復元');
    }
    throw failure(data.error || '保存できず。入力を残して再試行', response.status);
  }
  return data;
}
function hasDraft() {
  return document.querySelector('[data-comment-editor], [data-private-dirty]') ||
    Array.from(document.querySelectorAll('[data-memo-zone] .free-write, [data-inline-memo], #quick-text')).some(function (ta) { return ta.value !== ''; });
}
async function establish(started) {
  try {
    if (config.paused === true) { lock(pausedMessage); return; }
    if (!config.liffId || !config.apiBase) { lock('コメント共有の設定待ち。設定後にLINEから開く'); return; }
    var api = new URL(config.apiBase);
    if (api.protocol !== 'https:' || api.origin !== config.apiBase) throw failure('コメント共有の接続設定を確認');
    if (!window.liff) throw failure('LINEの読込に失敗。再読込前に未保存入力を確認');
    await window.liff.init({ liffId: config.liffId });
    if (started !== generation || document.hidden) return;
    if (!window.liff.isInClient()) { lock('LINEで共有リンクを開く'); return; }
    if (!window.liff.isLoggedIn()) { lock('LINEからログイン。未保存入力は同じアカウント確認後に復元'); return; }
    var checkingToken = window.liff.getIDToken();
    var session = await request('/session');
    if (started !== generation || document.hidden) return;
    // Bind drafts to server-verified identity, never to a display name or decoded client token.
    if (typeof session.author !== 'string' || !session.author || !/^[0-9a-f]{64}$/.test(session.viewer || '')) {
      throw failure('共有処理の更新が必要。未保存入力はこのページ内で保護');
    }
    var rows = [], cursor = '';
    do {
      if (started !== generation || document.hidden) return;
      var data = await request('/comments' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      rows = rows.concat(data.comments); cursor = data.next;
    } while (cursor);
    if (started !== generation || document.hidden) return;
    if (checkingToken !== window.liff.getIDToken()) throw failure('LINE認証が変わったため再確認');
    author = session.author; viewer = session.viewer; sessionToken = checkingToken; ready = true;
    window.dispatchEvent(new CustomEvent('comments-loaded', { detail: rows }));
    publish(author + 'として共有中。投稿・更新後に保存');
  } catch (error) {
    if (started === generation && !document.hidden) lock(error.message + '。未保存入力はこのページ内で保護');
  }
}
function connect(options) {
  if (document.hidden) return Promise.resolve();
  if (flight) { reconnectQueued = true; return flight; }
  if (ready && hasDraft() && !(options && options.revalidate)) {
    announce('入力を保存・取消してから再読込'); return Promise.resolve();
  }
  generation++; ready = false;
  window.dispatchEvent(new CustomEvent('comments-clear', { detail: { reason: 'recheck' } }));
  publish('LINE認証と保存済みコメントを確認中');
  var started = generation;
  flight = establish(started).finally(function () {
    flight = null;
    if (reconnectQueued && !document.hidden) {
      reconnectQueued = false;
      connect({ revalidate: true });
    }
  });
  return flight;
}
window.DonguriComments = {
  connect: connect,
  save: async function (path, method, body) {
    if (!ready) throw failure('コメント共有の接続を確認。未保存入力は保持');
    var started = generation;
    var data = await request(path, method, body);
    if (!ready || started !== generation) throw failure('LINE認証を再確認して保存結果を再読込');
    return data;
  }
};
if (login) login.addEventListener('click', function () { connect(); });
document.addEventListener('visibilitychange', function () { if (document.hidden) suspend(); else connect({ revalidate: true }); });
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', function (event) { if (event.persisted) connect({ revalidate: true }); });
setInterval(async function () {
  if (document.hidden || !ready) return;
  var started = generation, previous = viewer;
  try {
    var session = await request('/session');
    if (started !== generation || !ready) return;
    if (session.viewer !== previous) {
      protect('LINEアカウントを再確認。未保存入力は書いたアカウントで保護', 'comments-clear', 'identity');
      connect({ revalidate: true });
    }
  } catch (error) {
    // A temporary connection failure is not evidence of sign-out. Preserve visible editing state.
    if (started === generation && ready) announce('接続を確認できず。入力は保持し、通信回復後に保存');
  }
}, 60000);
connect();
})();
