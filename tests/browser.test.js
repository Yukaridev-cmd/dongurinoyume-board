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
  w.scrollTo = function () {};
  w.confirm = () => true;
  w.DONGURI_COMMENTS_CONFIG = configured ? { liffId: 'test-liff', apiBase: 'https://comments.example' } : {};
  w.liff = { init: async () => {}, isInClient: () => inLine, isLoggedIn: () => loggedIn, getIDToken: () => 'signed.id.token' };
  w.AbortSignal = AbortSignal;
  let failure = 0, deferPost = null, viewer = 'a'.repeat(64), hidden = false;
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  const intervals=[];w.setInterval=fn=>intervals.push(fn);
  w.fetch = async (url, options) => {
    requests.push({ url, options });
    if (failure === -1) throw Error('offline');
    if (failure) return Response.json({ error: '保存失敗' }, { status: failure });
    if (url.endsWith('/session')) return Response.json({ author: '本人', viewer });
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
    set failure(v) { failure = v; }, set deferPost(v) { deferPost = v; }, set viewer(v){viewer=v;}, intervals,
    visibility(v){hidden=v;w.document.dispatchEvent(new w.Event('visibilitychange'));},
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
    b.failure = 401; await b.w.DonguriComments.connect({revalidate:true});
    complete(); await tick();
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.equal(ta.value, '');
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
test('work search combines with category filters, ignores confidential comments and links to public-name inventory context',async()=>{
  const b=browser();try{await tick();const d=b.w.document,input=d.getElementById('work-search');
    input.value='マグネット';input.dispatchEvent(new b.w.Event('input'));let shown=[...d.querySelectorAll('.work')].filter(x=>!x.hidden);assert.equal(shown.length,1);assert.ok(shown[0].textContent.includes('マグネット'));
    const link=shown[0].querySelector('a[href^="private.html#inventory="]');assert.ok(link);assert.ok(decodeURIComponent(link.getAttribute('href')).includes('マグネット'));
    d.querySelector('[data-filter=amigurumi]').click();assert.equal([...d.querySelectorAll('.work')].filter(x=>!x.hidden).length,0);
    input.value='';input.dispatchEvent(new b.w.Event('input'));d.querySelector('[data-filter=all]').click();assert.equal([...d.querySelectorAll('.work')].filter(x=>!x.hidden).length,27);
    assert.equal(d.querySelector('.inline-memo').tagName,'DETAILS');assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
test('existing images, prices, event headings, page navigation, cream background and font are preserved', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    // The new welcome section reuses an existing photo; all original image/alt pairs remain intact.
    const preserved = { images: [...d.querySelectorAll('img')].filter(el=>!el.closest('.board-welcome')).map(el => [el.getAttribute('src'), el.getAttribute('alt')]) };
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

test('all new comment paths protect unsent text on background or denial and restore only for the verified owner',async()=>{
  const b=browser();try{
    await tick();const d=b.w.document,zone=b.zone().ta,inline=d.querySelector('[data-inline-memo]'),quick=d.querySelector('#quick-text');
    zone.value='private zone';inline.value='private inline';quick.value='private quick';
    b.visibility(true);for(const ta of [zone,inline,quick]){assert.equal(ta.value,'');assert.equal(ta.disabled,true);}
    assert.equal(b.requests.some(r=>r.options.method==='POST'),false);
    b.viewer='b'.repeat(64);b.visibility(false);await tick();for(const ta of [zone,inline,quick])assert.equal(ta.value,'');
    quick.value='member B';b.visibility(true);b.viewer='a'.repeat(64);b.visibility(false);await tick();assert.equal(zone.value,'private zone');assert.equal(inline.value,'private inline');assert.equal(quick.value,'private quick');
    b.failure=403;await b.intervals[0]();for(const ta of [zone,inline,quick])assert.equal(ta.value,'');
    b.failure=0;await b.w.DonguriComments.connect();await tick();assert.equal(quick.value,'private quick');assert.equal(b.w.localStorage.length,0);assert.equal(b.w.sessionStorage.length,0);assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});

test('unsaved comment edit survives background with original version while hidden DOM contains no text',async()=>{
  const b=browser();try{
    await tick();const {ta,add,zone}=b.zone();ta.value='saved comment';add.click();await tick();zone.querySelector('[data-comment-edit]').click();zone.querySelector('[data-comment-editor]').value='private edit';
    b.visibility(true);assert.equal(zone.querySelector('[data-comment-editor]'),null);assert.ok(!zone.textContent.includes('private edit'));assert.ok(!zone.textContent.includes('saved comment'));
    b.records[0].version=3;b.visibility(false);await tick();const editor=zone.querySelector('[data-comment-editor]');assert.equal(editor.value,'private edit');assert.equal(editor.getAttribute('data-comment-version'),'1');
    const save=[...zone.querySelectorAll('button')].find(btn=>btn.textContent==='変更を保存');save.click();await tick();assert.equal(JSON.parse(b.requests.find(r=>r.options.method==='PATCH').options.body).version,1);assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});

test('periodic network error keeps visible comment drafts and page-cache return restores protected input',async()=>{
  const b=browser();try{
    await tick();const {ta}=b.zone();ta.value='temporary draft';b.failure=-1;await b.intervals[0]();assert.equal(ta.value,'temporary draft');assert.equal(ta.disabled,false);
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(ta.value,'');
    b.failure=0;b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();assert.equal(ta.value,'temporary draft');assert.equal(b.requests.some(r=>r.options.method==='POST'),false);
    const unload=new b.w.Event('beforeunload',{cancelable:true});b.w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
  }finally{b.dom.window.close();}
});

test('keyboard tabs select visible panels and quick panel Escape restores trigger focus without losing input',async()=>{
  const b=browser();try{
    await tick();const d=b.w.document,tabs=[...d.querySelectorAll('[data-view-btn]')];tabs[0].focus();tabs[0].dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    assert.equal(d.activeElement,tabs[1]);assert.equal(tabs[1].getAttribute('aria-selected'),'true');assert.equal(d.querySelectorAll('[role=tab][tabindex="0"]').length,1);assert.equal(d.querySelector('#view-events').classList.contains('active'),true);assert.equal(tabs[1].getAttribute('aria-controls'),'view-events');
    tabs[1].dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(d.activeElement,tabs.at(-1));assert.equal(d.querySelector('#view-share').classList.contains('active'),true);
    d.querySelector('#quick-memo-btn').click();d.querySelector('#quick-text').value='unsent keyboard draft';d.querySelector('#quick-text').dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(d.querySelector('#quick-panel').hidden,true);assert.equal(d.activeElement,d.querySelector('#quick-memo-btn'));assert.equal(d.querySelector('#quick-text').value,'unsent keyboard draft');assert.equal(d.querySelector('#quick-memo-btn').getAttribute('aria-expanded'),'false');
    assert.ok([...d.querySelectorAll('[data-memo-zone] textarea,[data-inline-memo],#quick-text')].every(e=>e.getAttribute('aria-label')));assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});

test('work filters retain source catalog categories and navigation exposes the destination heading',async()=>{
  const b=browser({configured:false});try{
    const d=b.w.document;d.querySelector('[data-goto=works]').click();assert.equal(d.activeElement,d.querySelector('#view-works h2'));
    for(const btn of d.querySelectorAll('[data-filter]')){btn.click();const f=btn.dataset.filter;for(const card of d.querySelectorAll('.work[data-cat]')){
      const expected=f==='all'||(f==='unknown'?/未確認|未登録/.test(card.querySelector('.price-line')?.textContent||''):card.dataset.cat===f);assert.equal(card.hidden,!expected);
    }}assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});

test('existing pricing retains bundle quantities and unresolved bear-pouch descriptions remain intact',()=>{
  const dom=new JSDOM(html);try{
    const d=dom.window.document;
    assert.equal(d.querySelector('#work-hairpin .price-line').textContent,'2個 600円');
    assert.equal(d.querySelector('#work-magnet .price-line').textContent,'1コ 100円 3コ 250円／5コ 400円');
    assert.equal(d.querySelector('#work-sushi .price-line').textContent,'一貫 300円 四貫お買得パック 1,000円');
    assert.ok(d.querySelector('#work-kuma-pouch h3').textContent.includes('おしゃぶり'));assert.ok(d.querySelector('#work-kuma-pouch .memo').textContent.includes('おしゃぶりと哺乳瓶'));assert.ok(d.querySelector('#work-kuma-pouch .price-line').textContent.includes('未登録'));
  }finally{dom.window.close();}
});

test('Christmas venue detail is explicitly unconfirmed this year while December 19 10:00–17:00 is retained',()=>{
  const dom=new JSDOM(html);try{
    const d=dom.window.document,card=[...d.querySelectorAll('.event-card')].find(e=>e.querySelector('h3').textContent.includes('クリスマス')),detail=d.querySelector('#view-event-xmas');
    assert.ok(card.querySelector('.meta').textContent.includes('2026年12月19日（土）10:00〜17:00'));
    assert.ok(card.querySelector('.source-note').textContent.includes('詳細地点は昨年情報'));assert.ok(card.querySelector('.source-note').textContent.includes('今年も同じ地点かは未確認'));
    assert.ok(detail.querySelector('.facts').textContent.includes('2026年12月19日（土）10:00〜17:00'));
    assert.ok(detail.querySelector('.facts').textContent.includes('豊島五丁目団地は本人指定'));assert.ok(detail.querySelector('.facts').textContent.includes('今年も同じ詳細地点かは未確認'));assert.ok(!detail.textContent.includes('11:00'));
  }finally{dom.window.close();}
});
