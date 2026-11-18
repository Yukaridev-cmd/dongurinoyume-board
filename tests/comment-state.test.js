import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('only explicit server completion is archived; review, rejected and partial requests retain text and order', () => {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  try {
    const w = dom.window;
    for (const file of ['ui-core.js', 'comment-state.js'])
      w.eval(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
    const rows = [
      { id: 'done', text: '架空の反映済み', stamp: '2026-01-04', resolved: true },
      { id: 'review', text: '架空の確認待ち', stamp: '2026-01-03', resolved: false },
      { id: 'rejected', text: '架空の画像は作成済みだが不採用', stamp: '2026-01-02' },
      { id: 'partial', text: '架空の一部対応', stamp: '2026-01-01', resolved: false },
    ];
    const before = JSON.stringify(rows);
    const list = w.document.querySelector('main');
    w.DonguriCommentState.append(list, rows, (row) => {
      const card = w.document.createElement('article');
      card.dataset.id = row.id;
      card.textContent = row.text;
      return card;
    });
    assert.deepEqual(
      [...list.querySelectorAll(':scope > article')].map((n) => n.dataset.id),
      ['review', 'rejected', 'partial']
    );
    const archive = list.lastElementChild;
    assert.equal(archive.tagName, 'DETAILS');
    assert.equal(archive.open, false);
    assert.equal(archive.querySelector('article').textContent, rows[0].text);
    assert.equal(JSON.stringify(rows), before, 'rendering never changes saved status or body');
    assert.equal(list.querySelectorAll('article').length, rows.length);
  } finally {
    dom.window.close();
  }
});
