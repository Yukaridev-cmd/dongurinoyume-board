// Read-only DOM audit. No LIFF, credentials, API requests or database writes.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const dom = new JSDOM(read('index.html'), {
  runScripts: 'outside-only',
  url: 'https://example.test/',
});
const w = dom.window;
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};
w.setInterval = () => {};
try {
  for (const file of [
    'ui-core.js',
    'comment-state.js',
    'ime.js',
    'board.js',
    'workflow.js',
    'gallery.js',
    'comment-coverage.js',
  ])
    w.eval(read(file));
  const result = w.DonguriCommentCoverage.audit();
  const keys = [...w.document.querySelectorAll('[data-comment-key]')].map(
    (n) => n.dataset.commentKey
  );
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate comment corner IDs');
  if (result.uncovered.length)
    throw new Error('Missing comment corner: ' + result.uncovered.join(', '));
  console.log(
    'PASS: ' +
      result.required +
      ' content corners covered; ' +
      result.registered +
      ' stable new targets; 44 individual imported photos.'
  );
} finally {
  w.close();
}
