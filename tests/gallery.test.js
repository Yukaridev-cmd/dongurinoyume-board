import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function page() {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'outside-only',
    url: 'https://example.test/index.html',
  });
  dom.window.eval(read('gallery.js'));
  return dom;
}
test('44 approved photo derivatives contain only public display fields and assets', () => {
  const photos = JSON.parse(read('gallery.json'));
  assert.equal(photos.length, 44);
  assert.equal(new Set(photos.map((p) => p.id)).size, 44);
  for (const p of photos) {
    assert.deepEqual(Object.keys(p), [
      'id',
      'category',
      'title',
      'group',
      'src',
      'width',
      'height',
    ]);
    assert.ok(existsSync(new URL('../' + p.src, import.meta.url)));
    assert.ok(Math.max(p.width, p.height) <= 1080);
    assert.equal(p.src, 'assets/gallery/' + p.id + '.jpg');
  }
  for (const id of ['photo-006', 'photo-007', 'photo-008', 'photo-020'])
    assert.ok(photos.some((p) => p.id === id));
  assert.doesNotMatch(
    read('gallery.json'),
    /libfile_|Sentinel_|originals\/|sha256|"(?:inventory|customer|caption)"\s*:/
  );
  assert.doesNotMatch(
    read('gallery.js'),
    /fetch\s*\(|XMLHttpRequest|localStorage|DonguriComments|\.value\s*=(?!=)/
  );
});
test('photos are integrated into existing tabs; scoped category and event filters preserve editors', () => {
  const dom = page(),
    d = dom.window.document;
  const works = d.querySelector('#view-works #work-photo-library');
  const events = d.querySelector('#view-events #event-photo-library');
  const visible = () => works.querySelectorAll('.board-photo-card:not([hidden])').length;
  assert.equal(visible(), 16);
  assert.equal(events.querySelectorAll('.board-photo-card:not([hidden])').length, 28);
  assert.equal(d.querySelectorAll('.board-photo-card img').length, 44);
  assert.equal(d.querySelectorAll('.board-photo-card details').length, 0);
  for (const [category, count] of [
    ['works', 1],
    ['commission', 7],
    ['personal', 6],
    ['gift', 2],
  ]) {
    works.querySelector(`[data-category-filter="${category}"]`).click();
    assert.equal(visible(), count);
  }
  works.querySelector('[data-category-filter="all"]').click();
  const search = works.querySelector('[data-photo-search]');
  search.value = '犬のスタイ';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(visible(), 1);
  search.value = '存在しない写真';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(visible(), 0);
  assert.equal(works.querySelector('[data-photo-empty]').hidden, false);
  const group = events.querySelector('[data-photo-group]');
  for (const [label, count] of [
    ['ネコ市ネコ座 神戸（2025年9月）', 3],
    ['ネコ市ネコ座 愛知・委託販売（2026年4月）', 1],
  ]) {
    group.value = label;
    group.dispatchEvent(new dom.window.Event('change'));
    assert.equal(events.querySelectorAll('.board-photo-card:not([hidden])').length, count);
  }
  const editor = d.querySelector('textarea');
  editor.value = '架空の入力途中';
  editor.setSelectionRange(2, 2);
  group.value = 'all';
  group.dispatchEvent(new dom.window.Event('change'));
  assert.equal(editor.value, '架空の入力途中');
  assert.equal(editor.selectionStart, 2);
  assert.ok(d.querySelector('[data-goto-anchor="work-photo-library"]'));
  assert.ok(d.querySelector('[data-goto-anchor="event-photo-library"]'));
  assert.ok(read('gallery.html').includes('legacy-photo-link'));
  dom.window.close();
});
test('integrated enlargement restores focus and keeps image links as fallback', () => {
  const dom = page(),
    d = dom.window.document,
    dialog = d.getElementById('photo-dialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new dom.window.Event('close'));
  };
  const link = d.querySelector('#work-photo-library [data-photo]');
  link.click();
  assert.equal(dialog.open, true);
  assert.equal(d.getElementById('photo-large').alt, '犬のスタイ');
  d.getElementById('photo-close').click();
  assert.equal(dialog.open, false);
  assert.equal(d.activeElement, link);
  assert.ok(link.href.endsWith('/assets/gallery/photo-001.jpg'));
  dom.window.close();
});
