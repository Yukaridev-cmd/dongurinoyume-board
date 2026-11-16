import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../comments-api.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function browser({ configured = true, inLine = true, loggedIn = true, records = [] } = {}) {
  const errors = [], requests = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { url: 'https://yukaridev-cmd.github.io/dongurinoyume-board/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.confirm = () => true;
  w.DONGURI_COMMENTS_CONFIG = configured ? { liffId: 'test-liff', apiBase: 'https://comments.example' } : {};
  w.liff = { init: async () => {}, isInClient: () => inLine, isLoggedIn: () => loggedIn, getIDToken: () => 'signed.id.token' };
  w.AbortSignal = AbortSignal;
  let failure = 0, deferPost = null;
  w.fetch = async (url, options) => {
    requests.push({ url, options });
    if (failure) return Response.json({ error: '保存失敗' }, { status: failure });
    if (url.endsWith('/session')) return Response.json({ author: '本人' });
    if (options.method === 'POST') {
      if (url.endsWith('/records')) return Response.json({ record: { ...JSON.parse(options.body), version: 1 } }, { status: 201 });
      if (deferPost) await deferPost;
      const body = JSON.parse(options.body);
      const c = { ...body, author: '本人', stamp: new Date().toISOString(), canEdit: true, version: 1 };
      if (!records.some(row => row.id === c.id)) records.push(c);
      return Response.json({ comment: c }, { status: 201 });
    }
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body), id = url.split('/').at(-1);
      const c = records.find(row => row.id === id); Object.assign(c, { text: body.text, version: c.version + 1 });
      return Response.json({ comment: c });
    }
    if (options.method === 'DELETE') { records.splice(records.findIndex(row => url.endsWith(row.id)), 1); return Response.json({ deleted: true }); }
    return Response.json({ comments: records, next: null });
  };
  for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  w.eval(client);
  return { dom, w, requests, errors, records,
    set failure(v) { failure = v; }, set deferPost(v) { deferPost = v; },
    zone() { const zone = w.document.querySelector('[data-memo-zone]'); return { zone, ta: zone.querySelector('textarea'), add: zone.querySelector('[data-memo-add]') }; }
  };
}
test('unconfigured and external-browser views disable every posting path', async () => {
  for (const options of [{ configured: false }, { inLine: false }, { loggedIn: false }]) {
    const b = browser(options);
    try {
      await tick();
      assert.equal(b.errors.length, 0);
      assert.equal(b.requests.length, 0);
      assert.equal(b.zone().add.disabled, true);
      assert.equal(b.w.document.querySelector('#quick-add').disabled, true);
      assert.ok([...b.w.document.querySelectorAll('.inline-memo .btn')].every(btn => btn.disabled));
    } finally { b.dom.window.close(); }
  }
});
test('server comments restore in their item and summary, and text is rendered safely', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add } = b.zone();
    ta.value = '<img src=x onerror=alert(1)>'; add.click(); await tick();
    assert.equal(ta.value, ''); assert.equal(b.records.length, 1);
    const request = b.requests.find(r => r.options.method === 'POST');
    assert.equal('author' in JSON.parse(request.options.body), false);
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.headers.Authorization, 'Bearer signed.id.token');
    assert.equal(b.w.document.querySelectorAll('.memo-card img').length, 0);
    assert.ok(b.w.document.querySelector('#summary-list').textContent.includes('<img'));
    const restored = browser({ records: b.records });
    try {
      await tick(); assert.equal(restored.zone().zone.querySelectorAll('.memo-card').length, 1);
      assert.ok(restored.w.document.querySelector('#summary-list').textContent.includes('<img'));
      assert.equal(restored.w.localStorage.length, 0); assert.equal(restored.w.sessionStorage.length, 0);
    } finally { restored.dom.window.close(); }
    assert.equal(b.errors.length, 0);
  } finally { b.dom.window.close(); }
});
test('failed and repeated posting keeps the draft and retries the same id without a false saved card', async () => {
  const b = browser();
  try {
    await tick(); const { ta, add, zone } = b.zone();
    b.failure = 503; ta.value = '保存する本文'; add.click(); await tick();
    assert.equal(ta.value, '保存する本文'); assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    b.failure = 0; add.click(); await tick();
    const posts = b.requests.filter(r => r.options.method === 'POST').map(r => JSON.parse(r.options.body));
    assert.equal(posts[0].id, posts[1].id); assert.equal(ta.value, '');
    assert.equal(b.records.length, 1);
  } finally { b.dom.window.close(); }
});
test('pending save prevents double submission and preserves a newly typed draft', async () => {
  const b = browser();
  try {
    await tick(); const { ta, add } = b.zone();
    let complete; b.deferPost = new Promise(resolve => { complete = resolve; });
    ta.value = '最初の投稿'; add.click(); add.click(); ta.value = '次に書く内容';
    assert.equal(add.disabled, true); complete(); await tick();
    assert.equal(b.requests.filter(r => r.options.method === 'POST').length, 1);
    assert.equal(ta.value, '次に書く内容');
  } finally { b.dom.window.close(); }
});
test('editing persists explicitly, a failed edit retains text, and deleting updates the summary', async () => {
  const b = browser();
  try {
    await tick(); const { ta, add, zone } = b.zone(); ta.value = '元の本文'; add.click(); await tick();
    [...zone.querySelectorAll('.memo-card button')].find(el => el.textContent === '編集').click();
    const editor = zone.querySelector('[data-comment-editor]'); editor.value = '編集した本文';
    const save = [...zone.querySelectorAll('button')].find(el => el.textContent === '変更を保存');
    b.failure = 503; save.click(); await tick(); assert.equal(editor.value, '編集した本文'); assert.equal(b.records[0].text, '元の本文');
    b.failure = 0; save.click(); await tick(); assert.equal(b.records[0].text, '編集した本文');
    [...zone.querySelectorAll('.memo-card button')].find(el => el.textContent === '消す').click(); await tick();
    assert.equal(b.records.length, 0); assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.equal(b.errors.length, 0);
  } finally { b.dom.window.close(); }
});
test('authentication failure clears all visible comments and summaries', async () => {
  const b = browser();
  try {
    await tick(); const { ta, add, zone } = b.zone(); ta.value = '非公開コメント'; add.click(); await tick();
    b.failure = 403; await b.w.DonguriComments.connect();
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.ok(!b.w.document.querySelector('#summary-list').textContent.includes('非公開コメント'));
    assert.equal(add.disabled, true);
  } finally { b.dom.window.close(); }
});
test('page-cache navigation clears private comments and revalidates on return', async () => {
  const b=browser();try{
    await tick();const {ta,add,zone}=b.zone();ta.value='履歴に残さない本文';add.click();await tick();
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pagehide',{persisted:true}));
    assert.equal(zone.querySelectorAll('.memo-card').length,0);assert.equal(add.disabled,true);
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();
    assert.equal(zone.querySelectorAll('.memo-card').length,1);assert.equal(add.disabled,false);
  }finally{b.dom.window.close();}
});
test('inline card and quick-panel submissions retain the correct target', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document;
    const inline = d.querySelector('.work .inline-memo');
    inline.querySelector('textarea').value = '作品に投稿'; inline.querySelector('.btn').click(); await tick();
    assert.ok(b.records[0].target.startsWith('作品：'));
    assert.equal(inline.querySelectorAll('.memo-card').length, 1);
    d.querySelector('#quick-memo-btn').click();
    d.querySelector('#quick-text').value = 'ページに投稿'; d.querySelector('#quick-add').click(); await tick();
    assert.equal(b.records.length, 2);
    assert.ok(b.records[1].target.startsWith('ページ：'));
    assert.equal(d.querySelector('#quick-panel').hidden, true);
  } finally { b.dom.window.close(); }
});
test('a late save response after authentication loss cannot redisplay private comments', async () => {
  const b = browser();
  try {
    await tick(); const { ta, add, zone } = b.zone();
    let complete; b.deferPost = new Promise(resolve => { complete = resolve; });
    ta.value = '保存中の本文'; add.click();
    b.failure = 401; await b.w.DonguriComments.connect();
    complete(); await tick();
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.equal(ta.value, '保存中の本文');
    assert.equal(add.disabled, true);
  } finally { b.dom.window.close(); }
});
test('comments become pending private update requests only through an explicit click', async () => {
  const b=browser();
  try{
    await tick();const {ta,add,zone}=b.zone();ta.value='テストの更新依頼';add.click();await tick();
    assert.equal(b.requests.filter(r=>r.url.endsWith('/records')).length,0);
    [...zone.querySelectorAll('.memo-card button')].find(btn=>btn.textContent==='更新依頼にする').click();await tick();
    const sent=b.requests.find(r=>r.url.endsWith('/records'));const body=JSON.parse(sent.options.body);
    assert.equal(body.kind,'request');assert.equal(body.data.status,'未対応');assert.equal(body.data.notes,'テストの更新依頼');
    assert.ok(b.requests.every(r=>r.url.startsWith('https://comments.example/')));assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
test('existing images, prices, event headings, page navigation, cream background and font are preserved', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    const preserved = { images: [...d.querySelectorAll('img')].map(el => [el.getAttribute('src'), el.getAttribute('alt')]) };
    for (const selector of ['.view-head h2', '.price', '.meta', '[data-goto]']) {
      // The one intentional content-count change follows the added source-Sheet work.
      preserved[selector] = [...d.querySelectorAll(selector)].map(el => selector === '[data-goto]' ? el.textContent.replace(/27作品/g,'26作品') : el.textContent);
    }
    // Snapshot of public content from original commit c88b5c1, independent of HEAD.
    assert.equal(createHash('sha256').update(JSON.stringify(preserved)).digest('hex'), 'c2851423fae55255eb7eebc5109b95730acd61afe3eb4013959da0afcadc3207');
    assert.ok(html.includes('--paper:#fdf6e0')); assert.ok(html.includes('Meiryo UI'));
    assert.equal(html.includes('26作品'),false);assert.equal(d.querySelectorAll('.work').length,27);
    const nav = d.querySelector('[data-goto="works"]'); nav.click();
    assert.equal(d.querySelector('#view-works').classList.contains('active'), true);
    assert.ok(d.querySelectorAll('.work .inline-memo').length > 0);
  } finally { b.dom.window.close(); }
});
