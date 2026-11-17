import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
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
      ['commission', 7],
      ['personal', 6],
      ['gift', 2],
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
    assert.equal(d.querySelectorAll('.photo-event-record').length, 7);
    for (const [id, count] of [
      ['event-kiraria-0516', 1],
      ['event-toyoshima', 2],
      ['event-wombat', 3],
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
    assert.equal(d.querySelectorAll('#event-record-heart-202511 .board-photo-card').length, 2);
    assert.equal(d.querySelectorAll('#event-record-kobe-202509 .board-photo-card').length, 3);
    assert.equal(d.querySelectorAll('#event-record-aichi-202604 .board-photo-card').length, 1);
    assert.equal(d.querySelectorAll('.board-photo-card').length, 44);
    for (const img of d.querySelectorAll('.board-photo-card img'))
      assert.equal(img.closest('details'), null, 'photo must start outside a disclosure');
    assert.equal(d.querySelectorAll('.board-photo-card [data-inline-memo]').length, 44);
    assert.ok(d.getElementById('view-event-heart').textContent.includes('2026年11月'));
  } finally {
    dom.window.close();
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
