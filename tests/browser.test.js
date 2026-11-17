import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../comments-api.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
test('every content corner has its own editor and new corner omissions fail the coverage audit', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document,
      audit = b.w.DonguriCommentCoverage.audit();
    assert.deepEqual(Array.from(audit.uncovered), []);
    assert.equal(audit.registered, 202);
    assert.equal(
      d.querySelectorAll('.board-photo-card .comment-corner-slot [data-inline-memo]').length,
      44
    );
    assert.equal(d.querySelectorAll('figure .comment-corner-slot [data-inline-memo]').length, 66);
    assert.equal(
      d.querySelectorAll('[data-phase-panel] > .comment-corner-slot [data-inline-memo]').length,
      27
    );
    const count = d.querySelectorAll('[data-inline-memo]').length;
    b.w.DonguriCommentCoverage.mount(d);
    assert.equal(d.querySelectorAll('[data-inline-memo]').length, count);
    const corner = d.createElement('section');
    corner.className = 'idea';
    corner.textContent = '架空の新しい情報';
    d.getElementById('view-share').appendChild(corner);
    assert.ok(b.w.DonguriCommentCoverage.audit().uncovered.includes('idea'));
    corner.dataset.commentKey = 'test:future-corner';
    corner.dataset.commentLabel = '架空の新しい情報';
    b.w.DonguriCommentCoverage.mount(corner);
    assert.deepEqual(Array.from(b.w.DonguriCommentCoverage.audit().uncovered), []);
    assert.ok(corner.querySelector('[data-inline-memo]').disabled);
    assert.equal(b.requests.filter((r) => r.options?.method === 'POST').length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('individual photo comments save, reload and preserve IME and failed drafts under the shared auth guard', async () => {
  const records = [],
    b = browser({ records });
  try {
    await tick();
    const d = b.w.document;
    const corner = d.querySelector('[data-comment-key="photo:photo-001"]');
    const input = corner.querySelector('[data-inline-memo]'),
      button = corner.querySelector('.inline-memo .btn');
    input.value = '架空の写真コメント';
    input.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true }));
    button.click();
    await tick();
    assert.equal(records.length, 0);
    input.dispatchEvent(new b.w.CompositionEvent('compositionend', { bubbles: true }));
    await tick();
    button.click();
    await tick();
    assert.equal(records.length, 1);
    assert.equal(records[0].target, 'コーナー：photo:photo-001');
    assert.equal(corner.querySelectorAll('[data-comment-card]').length, 1);
    input.value = '架空の未送信';
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new b.w.Event('input', { bubbles: true }));
    b.w.DonguriCommentCoverage.mount(d);
    assert.equal(input.value, '架空の未送信');
    assert.equal(input.selectionStart, 2);
    b.failure = 503;
    button.click();
    await tick();
    assert.equal(input.value, '架空の未送信');
    assert.equal(records.length, 1);
    b.failure = 0;
    b.visibility(true);
    assert.equal(input.value, '');
    assert.equal(corner.querySelectorAll('[data-comment-card]').length, 0);
    b.visibility(false);
    await tick();
    await tick();
    assert.equal(input.value, '架空の未送信');
    const reload = browser({ records });
    try {
      await tick();
      const found = reload.w.document.querySelector('[data-comment-key="photo:photo-001"]');
      assert.equal(found.querySelectorAll('[data-comment-card]').length, 1);
      assert.ok(found.textContent.includes('架空の写真コメント'));
    } finally {
      reload.dom.window.close();
    }
    b.failure = 403;
    await b.intervals[0]();
    assert.equal(input.value, '');
    assert.equal(input.disabled, true);
    assert.equal(corner.querySelectorAll('[data-comment-card]').length, 0);
    assert.ok(!d.body.textContent.includes('架空の写真コメント'));
    b.failure = 0;
    b.viewer = 'b'.repeat(64);
    await b.w.DonguriComments.connect();
    await tick();
    assert.equal(input.value, '');
    b.visibility(true);
    b.viewer = 'a'.repeat(64);
    b.visibility(false);
    await tick();
    await tick();
    assert.equal(input.value, '架空の未送信');
  } finally {
    b.dom.window.close();
  }
});
test('photo entry points stay inside the four-tab board and never write private records', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    b.w.eval(readFileSync(new URL('../gallery.js', import.meta.url), 'utf8'));
    d.querySelector('[data-goto-anchor="work-photo-library"]').click();
    assert.equal(d.querySelector('.view.active').id, 'view-works');
    assert.equal(b.w.location.hash, '#work-photo-library');
    assert.equal(
      d.querySelectorAll('#work-photo-library .board-photo-card:not([hidden])').length,
      16
    );
    d.querySelector('[data-goto-anchor="event-photo-library"]').click();
    assert.equal(d.querySelector('.view.active').id, 'view-events');
    assert.equal(b.w.location.hash, '#event-photo-library');
    assert.equal(
      d.querySelectorAll('#event-photo-library .board-photo-card:not([hidden])').length,
      28
    );
    await tick();
    assert.equal(
      b.requests.filter((r) => r.options?.method && r.options.method !== 'GET').length,
      0
    );
    assert.equal(d.querySelectorAll('.primary-nav > button, .primary-nav > a').length, 4);
  } finally {
    b.dom.window.close();
  }
});
function browser({
  configured = true,
  inLine = true,
  loggedIn = true,
  records = [],
  events = [],
} = {}) {
  const errors = [],
    requests = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: 'https://yukaridev-cmd.github.io/dongurinoyume-board/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = function () {};
  w.confirm = () => true;
  w.DONGURI_COMMENTS_CONFIG = configured
    ? { liffId: 'test-liff', apiBase: 'https://comments.example' }
    : {};
  w.liff = {
    init: async () => {},
    isInClient: () => inLine,
    isLoggedIn: () => loggedIn,
    getIDToken: () => 'signed.id.token',
  };
  w.AbortSignal = AbortSignal;
  let failure = 0,
    deferPost = null,
    viewer = 'a'.repeat(64),
    hidden = false;
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  const intervals = [];
  w.setInterval = (fn) => intervals.push(fn);
  w.fetch = async (url, options) => {
    requests.push({ url, options });
    if (failure === -1) throw Error('offline');
    if (failure) return Response.json({ error: '保存失敗' }, { status: failure });
    if (url.endsWith('/session')) return Response.json({ author: '本人', viewer });
    if (options.method === 'POST') {
      if (url.endsWith('/records'))
        return Response.json(
          { record: { ...JSON.parse(options.body), version: 1 } },
          { status: 201 }
        );
      if (deferPost) await deferPost;
      const body = JSON.parse(options.body);
      const c = {
        ...body,
        author: '本人',
        stamp: new Date().toISOString(),
        canEdit: true,
        version: 1,
      };
      if (!records.some((row) => row.id === c.id)) records.push(c);
      return Response.json({ comment: c }, { status: 201 });
    }
    if (url.endsWith('/records')) return Response.json({ records: [], next: null });
    if (url.endsWith('/events')) return Response.json({ events, next: null });
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body),
        id = url.split('/').at(-1);
      const c = records.find((row) => row.id === id);
      Object.assign(
        c,
        Object.hasOwn(body, 'resolved')
          ? { resolved: body.resolved }
          : { text: body.text, resolved: false },
        { version: c.version + 1 }
      );
      return Response.json({ comment: c });
    }
    if (options.method === 'DELETE') {
      records.splice(
        records.findIndex((row) => url.endsWith(row.id)),
        1
      );
      return Response.json({ deleted: true });
    }
    return Response.json({ comments: records, next: null });
  };
  w.eval(readFileSync(new URL('../ui-core.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../comment-state.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../board.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../ime.js', import.meta.url), 'utf8'));
  for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  w.eval(readFileSync(new URL('../workflow.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../comment-coverage.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../event-board.js', import.meta.url), 'utf8'));
  w.eval(client);
  return {
    dom,
    w,
    requests,
    errors,
    records,
    set failure(v) {
      failure = v;
    },
    set deferPost(v) {
      deferPost = v;
    },
    set viewer(v) {
      viewer = v;
    },
    intervals,
    visibility(v) {
      hidden = v;
      w.document.dispatchEvent(new w.Event('visibilitychange'));
    },
    zone() {
      const zone = w.document.querySelector('[data-memo-zone]');
      return {
        zone,
        ta: zone.querySelector('textarea'),
        add: zone.querySelector('[data-memo-add]'),
      };
    },
  };
}
test('completed comments move below pending ones, survive reload and can reopen without deleting text or IME drafts', async () => {
  const records = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      target: 'ページ：ブース',
      text: '架空の未対応',
      author: '本人',
      stamp: '2026-01-01',
      version: 1,
      canEdit: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      target: 'ページ：ブース',
      text: '架空の完了',
      author: '妻',
      stamp: '2026-02-01',
      version: 3,
      resolved: true,
    },
  ];
  const b = browser({ records });
  try {
    await tick();
    const d = b.w.document;
    const list = d.querySelector('[data-comment-target="ページ：ブース"]');
    assert.match(list.firstElementChild.textContent, /架空の未対応/);
    const archive = list.querySelector('.comments-completed');
    assert.equal(archive.open, false);
    assert.match(archive.textContent, /架空の完了/);
    const draft = d.querySelector('#quick-text');
    draft.value = 'て';
    draft.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true }));
    list.querySelector('[data-comment-state]').click();
    await tick();
    assert.equal(draft.value, 'て');
    assert.equal(list.querySelectorAll(':scope>.memo-card').length, 0);
    assert.equal(list.querySelectorAll('.comments-completed .memo-card').length, 2);
    assert.equal(records[0].text, '架空の未対応');
    assert.equal(records[0].resolved, true);
    b.visibility(true);
    assert.equal(list.textContent, '');
    b.visibility(false);
    await tick();
    assert.equal(draft.value, 'て');
    assert.equal(list.querySelectorAll('.comments-completed .memo-card').length, 2);
    list.querySelector('[data-comment-state]').click();
    await tick();
    assert.equal(list.querySelectorAll(':scope>.memo-card').length, 1);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('unconfigured and external-browser views disable every posting path', async () => {
  for (const options of [{ configured: false }, { inLine: false }, { loggedIn: false }]) {
    const b = browser(options);
    try {
      await tick();
      assert.equal(b.errors.length, 0);
      assert.equal(b.requests.length, 0);
      assert.equal(b.zone().add.disabled, true);
      assert.equal(b.w.document.querySelector('#quick-add').disabled, true);
      assert.ok(
        [...b.w.document.querySelectorAll('.inline-memo .btn')].every((btn) => btn.disabled)
      );
    } finally {
      b.dom.window.close();
    }
  }
});
test('four destinations, event phases and shared market keep one copy of every comment target and use explicit event links', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    assert.equal(d.querySelectorAll('.primary-nav>*').length, 4);
    assert.ok(d.getElementById('view-events').classList.contains('active'));
    const event = d.getElementById('view-event-xmas');
    assert.equal(event.querySelector('[data-phase-panel=prepare]').hidden, false);
    event.querySelector('[data-phase=day]').click();
    assert.equal(event.querySelector('[data-phase-panel=prepare]').hidden, true);
    assert.equal(event.querySelector('[data-phase-panel=day]').hidden, false);
    assert.ok(
      event
        .querySelector('[data-phase-panel=day] a')
        .href.endsWith('#kind=review&event=event-xmas&new=1')
    );
    d.querySelector('[data-view-btn=market]').click();
    d.querySelector('[data-market=booth]').click();
    assert.equal(d.querySelector('[data-market-panel=booth]').hidden, false);
    assert.equal(d.querySelector('[data-market-panel=pops]').hidden, true);
    assert.equal(d.querySelectorAll('.pop-entry').length, 14);
    assert.equal(
      d.querySelectorAll('#view-market [data-memo-zone][aria-label="ブースのメモ"]').length,
      1
    );
    assert.equal(d.querySelector('#view-booth').children.length, 0);
    assert.equal(b.requests.length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('new private event cards appear only after authentication and disappear on background without HTML injection', async () => {
  const b = browser({
    events: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        publicReference: false,
        data: {
          title: '<img src=x onerror=alert(1)>',
          date: '2026-12-20',
          venue: '架空の非公開会場',
        },
      },
    ],
  });
  try {
    await tick();
    const box = b.w.document.getElementById('private-events-list');
    assert.ok(box.textContent.includes('架空の非公開会場'));
    assert.equal(box.querySelectorAll('img').length, 0);
    b.visibility(true);
    assert.equal(box.textContent.includes('架空の非公開会場'), false);
    assert.equal(
      b.requests.some((r) => r.options.method === 'POST'),
      false
    );
  } finally {
    b.dom.window.close();
  }
});
test('server comments restore in their item and summary, and text is rendered safely', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add } = b.zone();
    ta.value = '<img src=x onerror=alert(1)>';
    add.click();
    await tick();
    assert.equal(ta.value, '');
    assert.equal(b.records.length, 1);
    const request = b.requests.find((r) => r.options.method === 'POST');
    assert.equal('author' in JSON.parse(request.options.body), false);
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.headers.Authorization, 'Bearer signed.id.token');
    assert.equal(b.w.document.querySelectorAll('.memo-card img').length, 0);
    assert.ok(b.w.document.querySelector('#summary-list').textContent.includes('<img'));
    const restored = browser({ records: b.records });
    try {
      await tick();
      assert.equal(restored.zone().zone.querySelectorAll('.memo-card').length, 1);
      assert.ok(restored.w.document.querySelector('#summary-list').textContent.includes('<img'));
      assert.equal(restored.w.localStorage.length, 0);
      assert.equal(restored.w.sessionStorage.length, 0);
    } finally {
      restored.dom.window.close();
    }
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('failed and repeated posting keeps the draft and retries the same id without a false saved card', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    b.failure = 503;
    ta.value = '保存する本文';
    add.click();
    await tick();
    assert.equal(ta.value, '保存する本文');
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    b.failure = 0;
    add.click();
    await tick();
    const posts = b.requests
      .filter((r) => r.options.method === 'POST')
      .map((r) => JSON.parse(r.options.body));
    assert.equal(posts[0].id, posts[1].id);
    assert.equal(ta.value, '');
    assert.equal(b.records.length, 1);
  } finally {
    b.dom.window.close();
  }
});
test('pending save prevents double submission and preserves a newly typed draft', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add } = b.zone();
    let complete;
    b.deferPost = new Promise((resolve) => {
      complete = resolve;
    });
    ta.value = '最初の投稿';
    add.click();
    add.click();
    ta.value = '次に書く内容';
    assert.equal(add.disabled, true);
    complete();
    await tick();
    assert.equal(b.requests.filter((r) => r.options.method === 'POST').length, 1);
    assert.equal(ta.value, '次に書く内容');
  } finally {
    b.dom.window.close();
  }
});
test('editing persists explicitly, a failed edit retains text, and deleting updates the summary', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    ta.value = '元の本文';
    add.click();
    await tick();
    [...zone.querySelectorAll('.memo-card button')].find((el) => el.textContent === '編集').click();
    const editor = zone.querySelector('[data-comment-editor]');
    editor.value = '編集した本文';
    const save = [...zone.querySelectorAll('button')].find((el) => el.textContent === '変更を保存');
    b.failure = 503;
    save.click();
    await tick();
    assert.equal(editor.value, '編集した本文');
    assert.equal(b.records[0].text, '元の本文');
    b.failure = 0;
    save.click();
    await tick();
    assert.equal(b.records[0].text, '編集した本文');
    [...zone.querySelectorAll('.memo-card button')].find((el) => el.textContent === '消す').click();
    await tick();
    assert.equal(b.records.length, 0);
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('authentication failure clears all visible comments and summaries', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    ta.value = '非公開コメント';
    add.click();
    await tick();
    b.failure = 403;
    await b.w.DonguriComments.connect();
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.ok(!b.w.document.querySelector('#summary-list').textContent.includes('非公開コメント'));
    assert.equal(add.disabled, true);
  } finally {
    b.dom.window.close();
  }
});
test('page-cache navigation clears private comments and revalidates on return', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    ta.value = '履歴に残さない本文';
    add.click();
    await tick();
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pagehide', { persisted: true }));
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.equal(add.disabled, true);
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow', { persisted: true }));
    await tick();
    assert.equal(zone.querySelectorAll('.memo-card').length, 1);
    assert.equal(add.disabled, false);
  } finally {
    b.dom.window.close();
  }
});
test('inline card and quick-panel submissions retain the correct target', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document;
    const inline = d.querySelector('.work .inline-memo');
    inline.querySelector('textarea').value = '作品に投稿';
    inline.querySelector('.btn').click();
    await tick();
    assert.ok(b.records[0].target.startsWith('作品：'));
    assert.equal(inline.querySelectorAll('.memo-card').length, 1);
    d.querySelector('#quick-memo-btn').click();
    d.querySelector('#quick-text').value = 'ページに投稿';
    d.querySelector('#quick-add').click();
    await tick();
    assert.equal(b.records.length, 2);
    assert.ok(b.records[1].target.startsWith('ページ：'));
    assert.equal(d.querySelector('#quick-panel').hidden, true);
  } finally {
    b.dom.window.close();
  }
});
test('a late save response after authentication loss cannot redisplay private comments', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    let complete;
    b.deferPost = new Promise((resolve) => {
      complete = resolve;
    });
    ta.value = '保存中の本文';
    add.click();
    b.failure = 401;
    await b.w.DonguriComments.connect({ revalidate: true });
    complete();
    await tick();
    assert.equal(zone.querySelectorAll('.memo-card').length, 0);
    assert.equal(ta.value, '');
    assert.equal(add.disabled, true);
  } finally {
    b.dom.window.close();
  }
});
test('comments become pending private update requests only through an explicit click', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    ta.value = 'テストの更新依頼';
    add.click();
    await tick();
    assert.equal(b.requests.filter((r) => r.url.endsWith('/records')).length, 0);
    [...zone.querySelectorAll('.memo-card button')]
      .find((btn) => btn.textContent === 'AIへの依頼に追加')
      .click();
    await tick();
    const sent = b.requests.find((r) => r.url.endsWith('/records'));
    const body = JSON.parse(sent.options.body);
    assert.equal(body.kind, 'request');
    assert.equal(body.data.status, '未対応');
    assert.equal(body.data.notes, 'テストの更新依頼');
    assert.ok(b.requests.every((r) => r.url.startsWith('https://comments.example/')));
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('work search combines with category filters, ignores confidential comments and links to public-name inventory context', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document,
      input = d.getElementById('work-search');
    input.value = 'ヘアピン';
    input.dispatchEvent(new b.w.Event('input'));
    let shown = [...d.querySelectorAll('.work:not([data-sale=excluded])')].filter((x) => !x.hidden);
    assert.equal(shown.length, 1);
    assert.ok(shown[0].textContent.includes('ヘアピン'));
    const link = shown[0].querySelector('a[href^="private.html#inventory="]');
    assert.ok(link);
    assert.ok(decodeURIComponent(link.getAttribute('href')).includes('ヘアピン'));
    d.querySelector('[data-filter=amigurumi]').click();
    assert.equal(
      [...d.querySelectorAll('.work:not([data-sale=excluded])')].filter((x) => !x.hidden).length,
      0
    );
    input.value = '';
    input.dispatchEvent(new b.w.Event('input'));
    d.querySelector('[data-filter=all]').click();
    assert.equal(
      [...d.querySelectorAll('.work:not([data-sale=excluded])')].filter((x) => !x.hidden).length,
      17
    );
    assert.equal(d.querySelector('.inline-memo').tagName, 'DETAILS');
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('existing images, prices, event headings, page navigation, cream background and font are preserved', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    // Original facts from 61b822f remain exact when sections move. Navigation labels are separate.
    const preserved = {
      images: [...d.querySelectorAll('img,[data-reference-src]')]
        .filter(
          (e) =>
            !e.closest('.board-welcome') &&
            !e.hasAttribute('data-shared-photo') &&
            !e.closest('[data-reference-only]') &&
            !e.closest('[data-photo-library]') &&
            e.id !== 'photo-large'
        )
        .map((e) => [
          e.dataset.originalSrc || e.getAttribute('src') || e.dataset.referenceSrc,
          e.dataset.originalAlt ||
            (e.hasAttribute('alt') ? e.getAttribute('alt') : e.dataset.referenceAlt),
        ])
        .sort(),
      headings: [...d.querySelectorAll('.view-head h2')]
        .map((e) => e.textContent)
        .filter((x) => !['資料', '売り場'].includes(x))
        .sort(),
      prices: [...d.querySelectorAll('.price')].map((e) => e.textContent).sort(),
      meta: [...d.querySelectorAll('.meta')].map((e) => e.textContent).sort(),
    };
    assert.equal(
      createHash('sha256').update(JSON.stringify(preserved)).digest('hex'),
      '38fc400a017cfaff002f3e053af8c73f46f091bcbd4c43207f5b3fffd8170466'
    );
    assert.match(
      readFileSync(new URL('../board.css', import.meta.url), 'utf8'),
      /--paper:\s*#fdf6e0/
    );
    assert.ok(
      readFileSync(new URL('../typography.css', import.meta.url), 'utf8').includes('Meiryo UI')
    );
    assert.equal(html.includes('26作品'), false);
    assert.equal(d.querySelectorAll('.work').length, 27);
    const nav = d.querySelector('[data-goto="works"]');
    nav.click();
    assert.equal(d.querySelector('#view-works').classList.contains('active'), true);
    assert.ok(d.querySelectorAll('.work .inline-memo').length > 0);
  } finally {
    b.dom.window.close();
  }
});

test('notice templates are removed while archived tasks and comment targets stay intact', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document;
    function sourceText(selector) {
      const copy = d.querySelector(selector).cloneNode(true);
      copy.querySelectorAll('.comment-corner-slot').forEach((n) => n.remove());
      return copy.textContent;
    }
    const preserved = {
      home: sourceText('#legacy-home .task-list'),
      ideas: sourceText('#legacy-booth .idea-grid'),
      tasks: sourceText('#legacy-booth .task-list'),
    };
    assert.equal(
      createHash('sha256').update(JSON.stringify(preserved)).digest('hex'),
      '2fb0aeeaba01eec8922b88111117229f5a2b5dd1e67067e83a29cc092e126369'
    );
    assert.equal(d.querySelectorAll('#view-home .task-list,#view-booth .task-list').length, 0);
    assert.equal(
      d.querySelectorAll('#summary-copy,#quick-copy,#memo-download,.template-edit').length,
      0
    );
    assert.equal(d.querySelectorAll('#legacy-templates,[id^=tpl-]').length, 0);
    assert.ok(d.querySelector('#quick-panel a[href="private.html#kind=request"]'));
    assert.ok(d.querySelector('#comment-summary a[href="private.html#kind=request"]'));
    const zone = d.querySelector('#legacy-comments [data-memo-zone]');
    assert.equal(zone.getAttribute('aria-label'), 'LINE用文面のメモ');
    assert.equal(
      zone.querySelector('.memo-list').getAttribute('data-comment-target'),
      'ページ：LINE用文面'
    );
    d.querySelector('[data-goto-anchor="legacy-booth"]').click();
    assert.ok(d.querySelector('#view-share').classList.contains('active'));
    assert.ok(d.querySelector('#legacy-booth').open);
    assert.equal(b.requests.filter((r) => r.options.method === 'POST').length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('all new comment paths protect unsent text on background or denial and restore only for the verified owner', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document,
      zone = b.zone().ta,
      inline = d.querySelector('[data-inline-memo]'),
      quick = d.querySelector('#quick-text');
    zone.value = 'private zone';
    inline.value = 'private inline';
    quick.value = 'private quick';
    b.visibility(true);
    for (const ta of [zone, inline, quick]) {
      assert.equal(ta.value, '');
      assert.equal(ta.disabled, true);
    }
    assert.equal(
      b.requests.some((r) => r.options.method === 'POST'),
      false
    );
    b.viewer = 'b'.repeat(64);
    b.visibility(false);
    await tick();
    for (const ta of [zone, inline, quick]) assert.equal(ta.value, '');
    quick.value = 'member B';
    b.visibility(true);
    b.viewer = 'a'.repeat(64);
    b.visibility(false);
    await tick();
    assert.equal(zone.value, 'private zone');
    assert.equal(inline.value, 'private inline');
    assert.equal(quick.value, 'private quick');
    b.failure = 403;
    await b.intervals[0]();
    for (const ta of [zone, inline, quick]) assert.equal(ta.value, '');
    b.failure = 0;
    await b.w.DonguriComments.connect();
    await tick();
    assert.equal(quick.value, 'private quick');
    assert.equal(b.w.localStorage.length, 0);
    assert.equal(b.w.sessionStorage.length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('unsaved comment edit survives background with original version while hidden DOM contains no text', async () => {
  const b = browser();
  try {
    await tick();
    const { ta, add, zone } = b.zone();
    ta.value = 'saved comment';
    add.click();
    await tick();
    zone.querySelector('[data-comment-edit]').click();
    zone.querySelector('[data-comment-editor]').value = 'private edit';
    b.visibility(true);
    assert.equal(zone.querySelector('[data-comment-editor]'), null);
    assert.ok(!zone.textContent.includes('private edit'));
    assert.ok(!zone.textContent.includes('saved comment'));
    b.records[0].version = 3;
    b.visibility(false);
    await tick();
    const editor = zone.querySelector('[data-comment-editor]');
    assert.equal(editor.value, 'private edit');
    assert.equal(editor.getAttribute('data-comment-version'), '1');
    const save = [...zone.querySelectorAll('button')].find(
      (btn) => btn.textContent === '変更を保存'
    );
    save.click();
    await tick();
    assert.equal(
      JSON.parse(b.requests.find((r) => r.options.method === 'PATCH').options.body).version,
      1
    );
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('periodic network error keeps visible comment drafts and page-cache return restores protected input', async () => {
  const b = browser();
  try {
    await tick();
    const { ta } = b.zone();
    ta.value = 'temporary draft';
    b.failure = -1;
    await b.intervals[0]();
    assert.equal(ta.value, 'temporary draft');
    assert.equal(ta.disabled, false);
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pagehide', { persisted: true }));
    assert.equal(ta.value, '');
    b.failure = 0;
    b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow', { persisted: true }));
    await tick();
    assert.equal(ta.value, 'temporary draft');
    assert.equal(
      b.requests.some((r) => r.options.method === 'POST'),
      false
    );
    const unload = new b.w.Event('beforeunload', { cancelable: true });
    b.w.dispatchEvent(unload);
    assert.equal(unload.defaultPrevented, true);
  } finally {
    b.dom.window.close();
  }
});

test('keyboard tabs select visible panels and quick panel Escape restores trigger focus without losing input', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document,
      tabs = [...d.querySelectorAll('[data-view-btn]')];
    tabs[0].focus();
    tabs[0].dispatchEvent(
      new b.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    assert.equal(d.activeElement, tabs[1]);
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    assert.equal(d.querySelectorAll('[role=tab][tabindex="0"]').length, 1);
    assert.equal(d.querySelector('#view-works').classList.contains('active'), true);
    assert.equal(tabs[1].getAttribute('aria-controls'), 'view-works');
    tabs[1].dispatchEvent(
      new b.w.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
    );
    assert.equal(d.activeElement, tabs.at(-1));
    assert.equal(d.querySelector('#view-market').classList.contains('active'), true);
    d.querySelector('#quick-memo-btn').click();
    d.querySelector('#quick-text').value = 'unsent keyboard draft';
    d.querySelector('#quick-text').dispatchEvent(
      new b.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    assert.equal(d.querySelector('#quick-panel').hidden, true);
    assert.equal(d.activeElement, d.querySelector('#quick-memo-btn'));
    assert.equal(d.querySelector('#quick-text').value, 'unsent keyboard draft');
    assert.equal(d.querySelector('#quick-memo-btn').getAttribute('aria-expanded'), 'false');
    assert.ok(
      [...d.querySelectorAll('[data-memo-zone] textarea,[data-inline-memo],#quick-text')].every(
        (e) => e.getAttribute('aria-label')
      )
    );
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('work filters retain source catalog categories and navigation exposes the destination heading', async () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    d.querySelector('[data-goto=works]').click();
    assert.equal(d.activeElement, d.querySelector('#view-works h2'));
    for (const btn of d.querySelectorAll('[data-filter]')) {
      btn.click();
      const f = btn.dataset.filter;
      for (const card of d.querySelectorAll('.work[data-cat]:not([data-sale=excluded])')) {
        const expected =
          f === 'all' ||
          (f === 'unknown'
            ? /未確認|未登録/.test(card.querySelector('.price-line')?.textContent || '')
            : card.dataset.cat === f);
        assert.equal(card.hidden, !expected);
      }
    }
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('existing pricing retains bundle quantities and unresolved bear-pouch descriptions remain intact', () => {
  const dom = new JSDOM(html);
  try {
    const d = dom.window.document;
    assert.equal(d.querySelector('#work-hairpin .price-line').textContent, '2個 600円');
    assert.equal(
      d.querySelector('#work-magnet .price-line').textContent,
      '1コ 100円 3コ 250円／5コ 400円'
    );
    assert.equal(
      d.querySelector('#work-sushi .price-line').textContent,
      '一貫 300円 四貫お買得パック 1,000円'
    );
    assert.ok(d.querySelector('#work-kuma-pouch h3').textContent.includes('おしゃぶり'));
    assert.ok(d.querySelector('#work-kuma-pouch .memo').textContent.includes('おしゃぶりと哺乳瓶'));
    assert.ok(d.querySelector('#work-kuma-pouch .price-line').textContent.includes('未登録'));
  } finally {
    dom.window.close();
  }
});

test('Christmas venue detail is explicitly unconfirmed this year while December 19 10:00–17:00 is retained', () => {
  const dom = new JSDOM(html);
  try {
    const d = dom.window.document,
      card = [...d.querySelectorAll('.event-card')].find((e) =>
        e.querySelector('h3').textContent.includes('クリスマス')
      ),
      detail = d.querySelector('#view-event-xmas');
    assert.ok(card.querySelector('.meta').textContent.includes('2026年12月19日（土）10:00〜17:00'));
    assert.ok(card.querySelector('.source-note').textContent.includes('詳細地点は昨年情報'));
    assert.ok(card.querySelector('.source-note').textContent.includes('今年も同じ地点かは未確認'));
    assert.ok(
      detail.querySelector('.facts').textContent.includes('2026年12月19日（土）10:00〜17:00')
    );
    assert.ok(detail.querySelector('.facts').textContent.includes('豊島五丁目団地は本人指定'));
    assert.ok(detail.querySelector('.facts').textContent.includes('今年も同じ詳細地点かは未確認'));
    assert.ok(!detail.textContent.includes('11:00'));
  } finally {
    dom.window.close();
  }
});

test('main tabs restore their own scroll positions while subviews retain the focused control and do not write data', () => {
  const b = browser({ configured: false });
  try {
    const w = b.w,
      d = w.document;
    let y = 0;
    const scrolls = [];
    Object.defineProperty(w, 'scrollY', { get: () => y });
    w.scrollTo = (options) => {
      scrolls.push(options);
      y = options.top;
    };
    y = 130;
    d.querySelector('[data-view-btn=works]').click();
    assert.equal(y, 0);
    y = 840;
    d.querySelector('[data-view-btn=events]').click();
    assert.equal(y, 130);
    d.querySelector('[data-view-btn=works]').click();
    assert.equal(y, 840);
    assert.ok(scrolls.every((s) => s.behavior === 'instant'));
    w.DonguriBoard.showView('event-xmas');
    const phase = d.querySelector('#view-event-xmas [data-phase=day]');
    phase.focus();
    phase.click();
    assert.equal(d.activeElement, phase);
    assert.equal(phase.getAttribute('aria-pressed'), 'true');
    assert.equal(b.requests.length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('same verified identity refreshes private event cards without clearing or replacing unchanged content', async () => {
  const b = browser({
    events: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        publicReference: false,
        data: { title: '架空の非公開出店', date: '2026-12-20', venue: '架空会場' },
      },
    ],
  });
  try {
    await tick();
    const d = b.w.document,
      box = d.getElementById('private-events-list'),
      card = box.querySelector('article');
    card.querySelector('a').focus();
    b.w.dispatchEvent(
      new b.w.CustomEvent('comments-auth', { detail: { ready: true, viewer: 'a'.repeat(64) } })
    );
    assert.equal(box.querySelector('article'), card);
    await tick();
    assert.equal(box.querySelector('article'), card);
    assert.equal(d.activeElement, card.querySelector('a'));
    b.w.dispatchEvent(
      new b.w.CustomEvent('comments-auth', { detail: { ready: true, viewer: 'b'.repeat(64) } })
    );
    assert.equal(box.contains(card), false);
    assert.equal(box.textContent.includes('架空会場'), false);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('POP choices match existing source cards exactly and introduce no new images', () => {
  const dom = new JSDOM(html);
  try {
    const choices = JSON.parse(readFileSync(new URL('../pops.json', import.meta.url), 'utf8')),
      cards = [
        ...dom.window.document.querySelectorAll('.pop-entry:not([data-reference-only])'),
      ].map((e) => ({
        id: e.id,
        title: e.querySelector('h3').textContent.trim(),
      }));
    assert.deepEqual(choices, cards);
    assert.equal(new Set(choices.map((c) => c.id)).size, 12);
  } finally {
    dom.window.close();
  }
});

test('every event opens with its own complete photo list outside disclosures in every phase', async () => {
  const original = new JSDOM(html).window.document,
    b = browser();
  try {
    await tick();
    const d = b.w.document;
    for (const before of original.querySelectorAll('main[id^="view-event-"]')) {
      const view = d.getElementById(before.id),
        gallery = view.querySelector('.event-photo-gallery');
      assert.ok(gallery);
      const images = (n) =>
        [...n.querySelectorAll('img')].map((i) => [
          i.getAttribute('src'),
          i.alt,
          i.closest('figure')?.querySelector('figcaption')?.textContent,
        ]);
      assert.deepEqual(images(gallery), images(before));
      assert.equal(gallery.closest('details'), null);
      for (const button of view.querySelectorAll('[data-phase]')) {
        button.click();
        assert.equal(gallery.hidden, false);
        assert.equal(gallery.closest('[hidden]'), null);
      }
      for (const a of gallery.querySelectorAll('a'))
        assert.equal(a.href, a.querySelector('img').src);
      if (!before.querySelector('img')) assert.match(gallery.textContent, /写真はまだ未登録/);
    }
    assert.equal(b.requests.filter((r) => r.options.method === 'POST').length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    original.defaultView.close();
    b.dom.window.close();
  }
});
test('nine archived entries stay in separate reference storage, never sale search; portrait photo is not rendered', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document;
    assert.equal(d.querySelectorAll('.work:not([data-sale=excluded])').length, 17);
    assert.equal(d.querySelectorAll('#reference-works .work[data-sale=excluded]').length, 10);
    assert.equal(d.querySelector('#reference-works').open, false);
    assert.equal(d.querySelector('#work-result-count').textContent, '17作品を表示');
    const q = d.getElementById('work-search');
    q.value = 'マグネット';
    q.dispatchEvent(new b.w.Event('input'));
    assert.match(d.getElementById('work-result-count').textContent, /^0作品/);
    assert.equal(d.querySelectorAll('img[src="assets/kiraria5-magnet.jpg"]').length, 0);
    assert.ok(d.querySelector('#work-magnet [data-reference-src]'));
    assert.equal(d.querySelectorAll('.work').length, 27);
  } finally {
    b.dom.window.close();
  }
});

test('past event list and all seven original photo previews are visible without opening a disclosure', () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document;
    d.querySelector('[data-view-btn=events]').click();
    const past = d.querySelector('.past-events');
    assert.equal(past.tagName, 'SECTION');
    assert.equal(past.closest('details'), null);
    assert.equal(past.querySelectorAll('.event-card').length, 7);
    assert.equal(past.querySelectorAll('.event-card>img').length, 7);
    for (const img of past.querySelectorAll('.event-card>img')) {
      assert.equal(img.closest('details:not([open])'), null);
      assert.equal(img.closest('[hidden]'), null);
      const card = img.closest('.event-card'),
        id = card.querySelector('[data-goto]').dataset.goto;
      assert.ok(
        [...d.querySelectorAll('#view-' + id + ' .event-photo-gallery img')].some(
          (photo) => photo.getAttribute('src') === img.getAttribute('src')
        )
      );
    }
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('all POP previews start visible in image-first work-style cards and preserve content, actions and comment targets', () => {
  const source = new JSDOM(html).window.document,
    b = browser({ configured: false });
  try {
    const d = b.w.document,
      original = [...source.querySelectorAll('.pop-entry')],
      cards = [...d.querySelectorAll('.pop-grid>.pop-entry')];
    assert.equal(cards.length, 14);
    for (const old of original) {
      const card = d.getElementById(old.id);
      assert.equal(card.parentElement.classList.contains('work-grid'), true);
      assert.equal(card.firstElementChild.className.startsWith('pop-media'), true);
      assert.equal(
        card.querySelector('.body>.head h3').textContent,
        old.querySelector('h3').textContent
      );
      assert.deepEqual(
        [...card.querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.alt]),
        [...old.querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.alt])
      );
      assert.equal(card.querySelector('.body>.work-more').open, false);
      for (const preview of card.querySelectorAll('.pop-media .fig,.pop-media .pop'))
        assert.equal(preview.closest('details'), null);
      assert.equal(card.querySelectorAll('.inline-memo').length, 1);
      assert.equal(card.querySelector('.body>.inline-memo') !== null, true);
      assert.equal(
        card.querySelectorAll('[data-copy]').length,
        old.querySelectorAll('[data-copy]').length
      );
      assert.equal(
        card.querySelector('.facts')?.textContent,
        old.querySelector('.facts')?.textContent
      );
    }
    assert.equal(d.querySelectorAll('.pop-entry .compact-detail').length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('Japanese composition survives same-user revalidation without textarea writes, and saves only after confirmation', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document,
      ta = d.getElementById('quick-text'),
      panel = d.getElementById('quick-panel');
    d.getElementById('quick-memo-btn').click();
    ta.value = 'て';
    ta.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true, data: 'て' }));
    let valueWrites = 0,
      disabledWrites = 0;
    const proto = b.w.HTMLTextAreaElement.prototype,
      value = Object.getOwnPropertyDescriptor(proto, 'value'),
      disabled = Object.getOwnPropertyDescriptor(proto, 'disabled');
    Object.defineProperty(ta, 'value', {
      get() {
        return value.get.call(this);
      },
      set(v) {
        valueWrites++;
        value.set.call(this, v);
      },
    });
    Object.defineProperty(ta, 'disabled', {
      get() {
        return disabled.get.call(this);
      },
      set(v) {
        disabledWrites++;
        disabled.set.call(this, v);
      },
    });
    await b.w.DonguriComments.connect({ revalidate: true });
    assert.equal(ta.value, 'て');
    assert.equal(valueWrites, 0);
    assert.equal(disabledWrites, 0);
    ta.dispatchEvent(
      new b.w.KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
    );
    assert.equal(panel.hidden, false);
    d.getElementById('quick-add').click();
    await tick();
    assert.equal(b.requests.filter((r) => r.options.method === 'POST').length, 0);
    ta.value = 'テスト';
    ta.dispatchEvent(new b.w.CompositionEvent('compositionend', { bubbles: true, data: 'テスト' }));
    await tick();
    b.w.crypto.randomUUID = undefined;
    d.getElementById('quick-add').click();
    await tick();
    assert.equal(b.records.length, 1);
    assert.equal(b.records[0].text, 'テスト');
    assert.match(
      b.records[0].id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    assert.equal(ta.value, '');
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('comment save failures remain visible beside the input and preserve Japanese text', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document,
      ta = d.getElementById('quick-text');
    d.getElementById('quick-memo-btn').click();
    ta.value = 'テスト';
    b.failure = -1;
    d.getElementById('quick-add').click();
    await tick();
    assert.equal(ta.value, 'テスト');
    assert.match(d.querySelector('#quick-panel .comment-save-status').textContent, /通信/);
    assert.equal(d.getElementById('quick-panel').hidden, false);
    assert.equal(d.getElementById('quick-add').disabled, false);
  } finally {
    b.dom.window.close();
  }
});

test('editing an existing comment protects native composition before save or cancel', async () => {
  const b = browser();
  try {
    await tick();
    const origin = b.zone();
    origin.ta.value = '合成の元コメント';
    origin.add.click();
    await tick();
    const d = b.w.document,
      edit = origin.zone.querySelector('[data-comment-edit]');
    edit.click();
    const ta = d.querySelector('[data-comment-editor]');
    ta.value = 'て';
    ta.dispatchEvent(
      new b.w.InputEvent('beforeinput', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
      })
    );
    const buttons = [...ta.parentElement.querySelectorAll('button')];
    buttons.find((e) => e.textContent === '変更を保存').click();
    buttons.find((e) => e.textContent === '取消').click();
    await tick();
    assert.equal(ta.isConnected, true);
    assert.equal(ta.value, 'て');
    assert.equal(
      b.requests.some((r) => r.options.method === 'PATCH'),
      false
    );
    ta.value = 'テスト';
    ta.dispatchEvent(new b.w.CompositionEvent('compositionend', { bubbles: true }));
    await tick();
    buttons.find((e) => e.textContent === '変更を保存').click();
    await tick();
    assert.equal(b.records[0].text, 'テスト');
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('product corrections retain original comment targets and archive POP-only entries without losing source facts', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document,
      cat = d.getElementById('work-cat-burger');
    assert.equal(cat.querySelector('h3').textContent, 'にゃんバーガー');
    assert.equal(
      cat.querySelector('[data-comment-target]').getAttribute('data-comment-target'),
      '作品：ねこバーガーのキーホルダー'
    );
    assert.ok(d.getElementById('work-heart-bear').textContent.includes('非売品'));
    const happy = d.getElementById('work-happy-pack');
    assert.equal(happy.closest('#reference-works') !== null, true);
    assert.equal(happy.dataset.sale, 'excluded');
    assert.equal(d.querySelectorAll('#pop-happy').length, 1);
    assert.equal(
      d.querySelector('#work-sushi>img').getAttribute('src'),
      'assets/kiraria8-sushi-wood.jpg'
    );
    assert.ok(d.querySelector('#work-sushi a[href="assets/kiraria8-sushi-close.jpg"]'));
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('confirmed large-amigurumi photo correspondence keeps both original comment targets and catalog entries', async () => {
  const b = browser();
  try {
    await tick();
    const d = b.w.document;
    assert.equal(d.querySelector('#work-bunny').dataset.sale, 'excluded');
    assert.ok(d.querySelector('#work-bunny').closest('#reference-works'));
    assert.equal(d.querySelector('#work-bunny img'), null);
    assert.equal(
      d.querySelector('#work-bigamigurumi>img').getAttribute('src'),
      d.querySelector('#work-bunny [data-photo-alias]').dataset.referenceSrc
    );
    assert.ok(d.querySelector('#work-bunny [data-goto-anchor=work-bigamigurumi]'));
    assert.ok(d.querySelector('#work-bigamigurumi [data-goto-anchor=work-bunny]'));
    assert.equal(
      d.querySelector('#work-bunny [data-comment-target]').getAttribute('data-comment-target'),
      '作品：若草色のうさぎ'
    );
    assert.equal(
      d
        .querySelector('#work-bigamigurumi [data-comment-target]')
        .getAttribute('data-comment-target'),
      '作品：大きいあみぐるみ'
    );
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('real HTML entry points load shared helpers before dependent scripts and every local asset exists', () => {
  for (const page of ['index.html', 'private.html', 'event.html']) {
    const doc = new JSDOM(readFileSync(new URL('../' + page, import.meta.url), 'utf8')).window
      .document;
    const scripts = [...doc.querySelectorAll('script[src]')].map(
      (e) => e.getAttribute('src').split('?')[0]
    );
    assert.ok(scripts.includes('ui-core.js'));
    for (const dependency of [
      'board.js',
      'workflow.js',
      'context-comments.js',
      'private.js',
      'event.js',
    ])
      if (scripts.includes(dependency))
        assert.ok(scripts.indexOf('ui-core.js') < scripts.indexOf(dependency));
    for (const path of [
      ...scripts,
      ...[...doc.querySelectorAll('link[rel=stylesheet]')].map(
        (e) => e.getAttribute('href').split('?')[0]
      ),
    ].filter((p) => !p.startsWith('https:')))
      assert.ok(readFileSync(new URL('../' + path, import.meta.url)).length > 0);
  }
});

test('booth distinguishes a labeled concept from photograph-backed practice without inventing installation proof', () => {
  const b = browser({ configured: false });
  try {
    const d = b.w.document,
      booth = d.querySelector('[data-market-panel=booth]');
    assert.equal(booth.querySelectorAll('.booth-concept svg').length, 1);
    assert.equal(booth.querySelectorAll('.booth-detail svg[role=img]').length, 2);
    assert.match(booth.querySelector('#booth-turn-caption').textContent, /留め具・寸法は未確認/);
    assert.match(booth.querySelector('#booth-pick-caption').textContent, /本人の実践記録/);
    assert.match(
      booth.querySelector('#booth-concept-caption').textContent,
      /寸法・接合位置・耐荷重は未確認/
    );
    assert.equal(booth.querySelectorAll('.practice-photo img').length, 4);
    assert.equal(
      [...booth.querySelectorAll('.practice-photo img')].some((e) =>
        e.closest('details:not([open])')
      ),
      false
    );
    assert.match(
      booth.querySelectorAll('.practice-photo figcaption')[3].textContent,
      /テーブル中央の配置写真は確認待ち/
    );
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('preparation summaries keep zero distinct, private previews clear, and refreshed data never replaces an editor', async () => {
  const b = browser({ configured: false });
  try {
    await tick();
    const w = b.w,
      d = w.document;
    w.eval(readFileSync(new URL('../preparation.js', import.meta.url), 'utf8'));
    assert.ok(d.querySelector('.next-preparation .event-card h3'));
    assert.ok(d.querySelector('#work-bigamigurumi .body>.price-line'));
    assert.match(d.querySelector('#work-bigamigurumi [data-product-facts]').textContent, /未登録/);
    w.DonguriComments.save = async () => ({
      records: [
        {
          kind: 'inventory',
          data: { title: '大きいあみぐるみ', stock: 0 },
          updatedAt: '2026-11-17',
        },
      ],
      next: null,
    });
    const rows = [
      {
        id: 'example',
        target: '作品：大きいあみぐるみ',
        text: '架空の相談',
        stamp: '2026-11-17',
        resolved: false,
      },
    ];
    w.dispatchEvent(new w.CustomEvent('board-comments-rendered', { detail: rows }));
    assert.equal(d.querySelectorAll('.comment-peek').length, 0);
    w.dispatchEvent(
      new w.CustomEvent('comments-auth', {
        detail: { ready: true, viewer: 'a'.repeat(64), author: '架空' },
      })
    );
    await tick();
    assert.match(
      d.querySelector('#work-bigamigurumi .comment-peek').textContent,
      /未対応 1件.*架空の相談/
    );
    assert.match(d.querySelector('#work-bigamigurumi [data-product-facts]').textContent, /在庫：0/);
    const ta = d.querySelector('#quick-text');
    ta.value = 'て';
    ta.dispatchEvent(new w.CompositionEvent('compositionstart', { bubbles: true }));
    ta.dispatchEvent(new w.Event('input'));
    w.dispatchEvent(new w.CustomEvent('board-comments-rendered', { detail: rows }));
    assert.equal(ta.value, 'て');
    w.dispatchEvent(new w.Event('comments-clear'));
    assert.equal(d.querySelectorAll('.comment-peek').length, 0);
    assert.ok(!d.querySelector('.preparation-progress').textContent.includes('架空'));
    assert.match(
      d.querySelector('#work-bigamigurumi [data-product-facts]').textContent,
      /在庫：未登録/
    );
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('two imported POP references preserve original bytes, PDF link and the existing selection catalog', () => {
  const d = new JSDOM(html).window.document;
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('../assets/pop-omikuji-artwork.png', import.meta.url)))
      .digest('hex'),
    '8fd441aa6e80b41008cb62dbfe6844ea0649fc841e7c7adb8c4854e0e360f698'
  );
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('../assets/pop-instagram-qr.pdf', import.meta.url)))
      .digest('hex'),
    '3930e74e24326a77b43b52cbf409388c5e7b22ff9e7b7c66362474412a338763'
  );
  assert.ok(d.querySelector('#pop-instagram-qr a[href="assets/pop-instagram-qr.pdf"]'));
  assert.ok(d.querySelector('#pop-omikuji img[src="assets/heart-omikuji.jpg"]'));
  assert.match(d.querySelector('#pop-omikuji-artwork').textContent, /マグネット2個600円/);
  assert.match(d.querySelector('#pop-omikuji').textContent, /ヘアピン2個600円/);
  assert.equal(d.querySelectorAll('.pop-entry[data-reference-only]').length, 2);
});
