import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function page(category = '') {
  const dom = new JSDOM(read('gallery.html'), {
    runScripts: 'outside-only',
    url: 'https://example.test/gallery.html' + category,
  });
  dom.window.eval(read('gallery.js'));
  return dom;
}

test('gallery publishes the explicit reviewed set without private source metadata', () => {
  const photos = JSON.parse(read('gallery.json'));
  assert.equal(photos.length, 40);
  assert.equal(new Set(photos.map((p) => p.id)).size, 40);
  for (const photo of photos) {
    assert.deepEqual(Object.keys(photo), [
      'id',
      'category',
      'title',
      'group',
      'src',
      'width',
      'height',
    ]);
    assert.ok(existsSync(new URL('../' + photo.src, import.meta.url)));
    assert.ok(Math.max(photo.width, photo.height) <= 1080);
    assert.equal(photo.src, 'assets/gallery/' + photo.id + '.jpg');
  }
  for (const id of ['photo-006', 'photo-007', 'photo-008', 'photo-020']) {
    assert.ok(!photos.some((p) => p.id === id));
    assert.ok(!existsSync(new URL('../assets/gallery/' + id + '.jpg', import.meta.url)));
  }
  assert.doesNotMatch(
    read('gallery.html') + read('gallery.json'),
    /libfile_|Sentinel_|originals\/|sha256|"(?:inventory|customer|caption)"\s*:/
  );
  assert.doesNotMatch(
    read('gallery.js'),
    /fetch\s*\(|XMLHttpRequest|localStorage|DonguriComments|\.value\s*=/
  );
});

test('photos start visible and filters, search, empty state and incoming links work', () => {
  const dom = page();
  const d = dom.window.document;
  const visible = () => d.querySelectorAll('.photo-card:not([hidden])').length;
  assert.equal(visible(), 40);
  assert.equal(d.querySelectorAll('.photo-card img').length, 40);
  assert.equal(d.querySelectorAll('.photo-card details').length, 0);
  for (const [category, count] of [
    ['works', 1],
    ['commission', 7],
    ['personal', 6],
    ['gift', 2],
    ['events', 24],
  ]) {
    d.querySelector(`[data-category-filter="${category}"]`).click();
    assert.equal(visible(), count);
  }
  d.querySelector('[data-category-filter="all"]').click();
  const search = d.getElementById('photo-search');
  search.value = '犬のスタイ';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(visible(), 1);
  search.value = '存在しない写真';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(visible(), 0);
  assert.equal(d.getElementById('photo-empty').hidden, false);
  dom.window.close();
  const events = page('?category=events');
  assert.equal(events.window.document.querySelectorAll('.photo-card:not([hidden])').length, 24);
  assert.ok(events.window.document.getElementById('gallery-back').href.endsWith('#events'));
  events.window.close();
});

test('native enlargement closes and restores focus; plain image link remains the fallback', () => {
  const dom = page();
  const d = dom.window.document;
  const dialog = d.getElementById('photo-dialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new dom.window.Event('close'));
  };
  const link = d.querySelector('[data-photo]');
  link.click();
  assert.equal(dialog.open, true);
  assert.equal(d.getElementById('photo-large').alt, '犬のスタイ');
  d.getElementById('photo-close').click();
  assert.equal(dialog.open, false);
  assert.equal(d.activeElement, link);
  assert.ok(link.href.endsWith('/assets/gallery/photo-001.jpg'));
  dom.window.close();
});
