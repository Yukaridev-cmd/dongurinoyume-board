import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function page() {
  const dom = new JSDOM(read('index.html'), {
      runScripts: 'outside-only',
      url: 'https://example.test/index.html',
    }),
    w = dom.window;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.setInterval = () => {};
  for (const file of [
    'ui-core.js',
    'comment-state.js',
    'ime.js',
    'board.js',
    'workflow.js',
    'work-collections.js',
    'gallery.js',
    'comment-coverage.js',
  ])
    w.eval(read(file));
  return dom;
}
test('44 photos retain source assets and keys while descriptive names and confirmed event months improve discovery', () => {
  const photos = JSON.parse(read('gallery.json'));
  assert.equal(photos.length, 44);
  assert.equal(new Set(photos.map((p) => p.id)).size, 44);
  for (const p of photos) {
    assert.ok(existsSync(new URL('../' + p.src, import.meta.url)));
    assert.ok(Math.max(p.width, p.height) <= 1080);
    assert.equal(p.src, 'assets/gallery/' + p.id + '.jpg');
    assert.notEqual(p.title, '作品写真');
  }
  assert.equal(photos.find((p) => p.id === 'photo-005').group, 'きらりあマルシェ（2026年5月）');
  assert.equal(photos.find((p) => p.id === 'photo-009').group, 'ハートまつり（2025年11月）');
  assert.equal(photos.find((p) => p.id === 'photo-010').group, 'ハートまつり（2025年11月）');
  assert.doesNotMatch(
    read('gallery.json'),
    /libfile_|Sentinel_|originals\/|sha256|"(?:inventory|customer|caption)"\s*:/
  );
});
test('work collections are shallow, search all public names and preserve unsent photo comments', () => {
  const dom = page(),
    d = dom.window.document,
    w = dom.window;
  w.DonguriBoard.showView('works');
  try {
    const panels = [...d.querySelectorAll('[data-work-panel]')];
    assert.equal(panels.length, 4);
    for (const [id, n] of [
      ['works', 1],
      ['commission', 5],
      ['personal', 6],
      ['gift', 4],
    ]) {
      d.querySelector('[data-work-collection=' + id + ']').click();
      assert.equal(panels.filter((p) => !p.hidden).length, 1);
      assert.equal(
        d.querySelector('[data-work-panel=' + id + ']').querySelectorAll('.board-photo-card')
          .length,
        n
      );
    }
    const input = d.querySelector('[data-comment-key="photo:photo-001"] textarea');
    input.value = '架空の未保存';
    input.setSelectionRange(2, 2);
    const search = d.getElementById('work-search');
    search.value = '犬のスタイ';
    search.dispatchEvent(new w.Event('input'));
    assert.equal(d.querySelector('[data-work-panel=commission]').hidden, false);
    assert.match(d.getElementById('work-collection-status').textContent, /1件/);
    search.value = '架空の未保存';
    search.dispatchEvent(new w.Event('input'));
    assert.match(d.getElementById('work-collection-status').textContent, /0件/);
    assert.equal(input.value, '架空の未保存');
    assert.equal(input.selectionStart, 2);
    search.value = '';
    search.dispatchEvent(new w.Event('input'));
    assert.equal(d.querySelector('[data-work-panel=gift]').hidden, false);
    assert.deepEqual(Array.from(w.DonguriCommentCoverage.audit().uncovered), []);
  } finally {
    w.close();
  }
});
test('event photos belong to matching existing information or chronological new records, never a separate library', () => {
  const dom = page(),
    d = dom.window.document;
  try {
    assert.equal(d.querySelector('#view-events > [data-photo-library]'), null);
    assert.equal(d.querySelectorAll('[data-public-photo-record]').length, 6);
    for (const [id, count] of [
      ['event-kiraria-0516', 1],
      ['event-toyoshima', 2],
      ['event-wombat', 3],
      ['event-kiraria-0829', 2],
    ]) {
      const view = d.getElementById('view-' + id);
      assert.equal(view.querySelectorAll('.board-photo-card').length, count);
      for (const img of view.querySelectorAll('.board-photo-card img'))
        assert.equal(img.closest('details'), null);
    }
    const months = [...d.querySelectorAll('#event-photo-library > .event-card')].map(
      (n) => n.dataset.eventMonth
    );
    assert.deepEqual(months, [...months].sort().reverse());
    assert.equal(d.querySelectorAll('#view-event-record-heart-202511 .board-photo-card').length, 2);
    assert.equal(d.querySelectorAll('#view-event-record-kobe-202509 .board-photo-card').length, 3);
    assert.equal(d.querySelectorAll('#view-event-record-aichi-202604 .board-photo-card').length, 1);
    assert.equal(d.querySelectorAll('.board-photo-card').length, 44);
    const may = d.getElementById('view-event-kiraria-0516');
    assert.match(may.querySelector('h2').textContent, /2026年5月/);
    assert.equal(may.querySelectorAll('.board-photo-card').length, 1);
    assert.ok(may.querySelector('[data-comment-key="photo:photo-005"]'));
    for (const id of ['photo-036', 'photo-037']) {
      assert.ok(d.querySelector('#view-event-kiraria-0829 [data-comment-key="photo:' + id + '"]'));
      assert.equal(may.querySelector('[data-comment-key="photo:' + id + '"]'), null);
    }
    for (const view of d.querySelectorAll('[data-public-photo-record]'))
      assert.equal(
        view.parentElement,
        may.parentElement,
        'all detail views use the same layout shell'
      );
    for (const img of d.querySelectorAll('.board-photo-card img'))
      assert.equal(img.closest('details'), null, 'photo must start outside a disclosure');
    assert.equal(d.querySelectorAll('.board-photo-card [data-inline-memo]').length, 44);
    assert.ok(d.getElementById('view-event-heart').textContent.includes('2026年11月'));
  } finally {
    dom.window.close();
  }
});
test('collection order, corrected photo groups and event detail navigation preserve comment inputs', () => {
  const dom = page(),
    d = dom.window.document,
    w = dom.window;
  try {
    assert.deepEqual(
      [...d.querySelectorAll('[data-work-collection]')].map((n) => n.dataset.workCollection),
      ['works', 'commission', 'gift', 'personal']
    );
    for (const id of ['photo-040', 'photo-041'])
      assert.equal(
        d.querySelector('[data-comment-key="photo:' + id + '"]').closest('[data-work-panel]')
          .dataset.workPanel,
        'gift'
      );
    assert.match(
      d.querySelector('[data-comment-key="photo:photo-002"] .photo-set-note').textContent,
      /ニャカロン/
    );
    assert.match(
      d.querySelector('[data-comment-key="photo:photo-003"] .photo-set-note').textContent,
      /鳥のソフトクリーム/
    );
    const input = d.querySelector('[data-comment-key="photo:photo-024"] textarea');
    input.value = '架空の変換中';
    input.setSelectionRange(2, 2);
    d.querySelector('[data-goto="event-record-neko-unconfirmed"]').click();
    assert.equal(d.querySelector('.view.active').id, 'view-event-record-neko-unconfirmed');
    assert.match(d.querySelector('.view.active h2').textContent, /2026年7月/);
    assert.equal(d.querySelectorAll('.view.active .board-photo-card').length, 9);
    assert.equal(
      d.querySelector('#event-record-neko-unconfirmed [data-comment-target]').dataset.commentTarget,
      d.querySelector(
        '#view-event-record-neko-unconfirmed > .comment-corner-slot [data-comment-target]'
      ).dataset.commentTarget
    );
    d.querySelector('.view.active .backlink').click();
    assert.equal(d.querySelector('.view.active').id, 'view-events');
    assert.equal(input.value, '架空の変換中');
    assert.equal(input.selectionStart, 2);
    assert.ok(
      d.querySelector(
        '#view-event-kiraria-0829 [data-comment-key="event-record:kiraria-september-unconfirmed"]'
      )
    );
    assert.equal(d.querySelectorAll('[data-public-photo-record] a[href^="event.html"]').length, 0);
  } finally {
    w.close();
  }
});
test('photo enlargement remains available after moving into event records and restores focus', () => {
  const dom = page(),
    d = dom.window.document,
    dialog = d.getElementById('photo-dialog');
  try {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new dom.window.Event('close'));
    };
    const link = d.querySelector('[data-comment-key="photo:photo-005"] [data-photo]');
    link.click();
    assert.equal(dialog.open, true);
    assert.equal(d.getElementById('photo-large').alt, '花のキーホルダー');
    d.getElementById('photo-close').click();
    assert.equal(dialog.open, false);
    assert.equal(d.activeElement, link);
    assert.equal(d.querySelectorAll('a a').length, 0);
  } finally {
    dom.window.close();
  }
});
test('confirmed venues and public record month retain original event and photo identities', () => {
  const dom = page(),
    d = dom.window.document;
  try {
    const tokyo = d.getElementById('view-event-record-tokyo-unconfirmed');
    assert.match(tokyo.querySelector('h2').textContent, /2025年3月/);
    assert.match(tokyo.textContent, /東京都立産業貿易センター浜松町館/);
    assert.equal(tokyo.dataset.commentKey, 'event-record:tokyo-unconfirmed');
    assert.equal(tokyo.querySelectorAll('.board-photo-card').length, 4);
    assert.match(
      d.getElementById('view-event-record-neko-unconfirmed').textContent,
      /大田区産業プラザPiO/
    );
    assert.match(
      d.getElementById('view-event-record-kobe-202509').textContent,
      /デザインクリエイティブセンター神戸/
    );
    for (const id of ['view-event-heart', 'view-event-record-heart-202511'])
      assert.match(d.getElementById(id).textContent, /滝野川東区民センター/);
    const wombat = d.getElementById('view-event-wombat');
    assert.match(wombat.textContent, /1日目（屋外）：栄町商店街／2日目（屋内）：五月山体育館/);
    assert.match(wombat.textContent, /2日目の日付は未確認/);
    for (const id of ['photo-021', 'photo-022', 'photo-023'])
      assert.equal(
        wombat.querySelector('[data-comment-key="photo:' + id + '"]').dataset.group,
        'ウォンバットマルシェ（2026年10月）'
      );
    assert.equal(d.querySelectorAll('.board-photo-card').length, 44);
    assert.deepEqual(Array.from(dom.window.DonguriCommentCoverage.audit().uncovered), []);
  } finally {
    dom.window.close();
  }
});
test('retired POP stays recoverable while renamed artwork retains the saved discussion target', () => {
  const dom = page(),
    d = dom.window.document;
  try {
    const old = d.getElementById('pop-omikuji'),
      art = d.getElementById('pop-omikuji-artwork');
    assert.equal(old.closest('.pop-archive').open, false);
    assert.ok(old.querySelector('img'));
    assert.equal(d.querySelectorAll('.pop-grid > .pop-entry').length, 13);
    assert.equal(d.querySelectorAll('.pop-entry').length, 14);
    assert.equal(art.querySelector('h3').textContent, 'あみものおみくじのポップ');
    assert.equal(
      art.querySelector('[data-comment-target]').dataset.commentTarget,
      'ポップ：あみものおみくじのポップ（添付原画）'
    );
    assert.equal(
      d.querySelector('#pop-xmas img').getAttribute('src'),
      'assets/pop-christmas-v2.png'
    );
    assert.equal(d.querySelector('#pop-xmas .badge').textContent, '改訂案・確認待ち');
    assert.doesNotMatch(
      read('assets/pop-christmas-draft.svg'),
      /<script|https?:\/\/[^"\s]+\.(?:js|png|jpg)|libfile_|Sentinel_|U[a-f0-9]{32}/
    );
  } finally {
    dom.window.close();
  }
});
test('retired booth portrait no longer renders, while source and the original discussion remain accessible', () => {
  const dom = page(),
    d = dom.window.document;
  try {
    const f = d.querySelector('[data-comment-key="figure:view-booth:kiraria-bunny.jpg"]');
    assert.equal(f.closest('.archived-booth-photo').open, false);
    assert.equal(f.querySelector('img'), null);
    assert.equal(
      f.querySelector('[data-reference-src]').dataset.referenceSrc,
      'assets/kiraria-bunny.jpg'
    );
    assert.equal(f.querySelector('a').getAttribute('href'), 'assets/kiraria-bunny.jpg');
    assert.ok(f.querySelector('[data-inline-memo]'));
    assert.equal(
      d.querySelectorAll(
        '#view-market [data-market-panel=booth] img[src="assets/kiraria-bunny.jpg"]'
      ).length,
      0
    );
    assert.ok(d.querySelector('#view-event-kiraria-1107 img[src="assets/kiraria-bunny.jpg"]'));
    assert.ok(d.querySelector('#view-works img[src="assets/kiraria-bunny.jpg"]'));
    assert.deepEqual(Array.from(dom.window.DonguriCommentCoverage.audit().uncovered), []);
  } finally {
    dom.window.close();
  }
});
test('rejected background attempts remain in history; displayed originals preserve keys, inputs and focus', () => {
  const rows = JSON.parse(read('artwork/photo-backgrounds.json'));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.status, 'rejected');
    assert.equal(
      JSON.parse(read('gallery.json')).find((p) => p.id === row.id).displaySrc,
      undefined
    );
    for (const [path, sha] of [
      [row.source, row.sourceSha256],
      [row.output, row.outputSha256],
      [row.mask, row.maskSha256],
    ])
      assert.equal(
        createHash('sha256')
          .update(readFileSync(new URL('../' + path, import.meta.url)))
          .digest('hex'),
        sha
      );
    const png = readFileSync(new URL('../' + row.output, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], row.size);
    assert.ok(row.protectedPixels > 190000);
  }
  const dom = page(),
    d = dom.window.document,
    dialog = d.getElementById('photo-dialog');
  try {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new dom.window.Event('close'));
    };
    dom.window.DonguriBoard.showView('works');
    d.querySelector('[data-work-collection=commission]').click();
    for (const row of rows) {
      const card = d.querySelector('[data-comment-key="photo:' + row.id + '"]');
      assert.equal(card.querySelector('img').getAttribute('src'), row.source);
      const input = card.querySelector('textarea');
      input.value = '架空の入力中';
      input.setSelectionRange(2, 2);
      const original = card.querySelector('a[data-photo]');
      original.click();
      assert.equal(dialog.open, true);
      assert.ok(d.getElementById('photo-large').src.endsWith(row.source));
      d.getElementById('photo-close').click();
      assert.equal(d.activeElement, original);
      assert.equal(input.value, '架空の入力中');
      assert.equal(input.selectionStart, 2);
      assert.equal(card.querySelector('a[href="' + row.output + '"]'), null);
    }
    assert.equal(d.querySelectorAll('.board-photo-card').length, 44);
    assert.equal(d.querySelectorAll('[data-photo-original]').length, 0);
    assert.deepEqual(Array.from(dom.window.DonguriCommentCoverage.audit().uncovered), []);
  } finally {
    dom.window.close();
  }
});
