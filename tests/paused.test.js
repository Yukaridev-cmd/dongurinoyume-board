import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('emergency paused configuration explains unavailable private features and starts no authentication or API calls', async () => {
  const dom = new JSDOM(
      '<header><button id="quick-memo-btn">コメントを書く</button></header><p id="comments-status"></p><button id="comments-login"></button>',
      { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test' }
    ),
    w = dom.window;
  let calls = 0;
  try {
    w.liff = {
      init: async () => {
        calls++;
      },
    };
    w.fetch = async () => {
      calls++;
      throw Error('unexpected network');
    };
    w.eval(read('comments-config.js'));
    w.DONGURI_COMMENTS_CONFIG = Object.freeze({ ...w.DONGURI_COMMENTS_CONFIG, paused: true });
    w.eval(read('comments-api.js'));
    await w.DonguriComments.connect();
    assert.equal(calls, 0);
    assert.match(w.document.getElementById('comments-status').textContent, /保存・閲覧は停止中/);
    assert.match(w.document.querySelector('.sharing-paused').textContent, /二人の設定待ち/);
    assert.equal(w.document.getElementById('comments-login').disabled, true);
    await assert.rejects(w.DonguriComments.save('/comments', 'POST', { text: 'synthetic' }));
    assert.equal(calls, 0);
  } finally {
    dom.window.close();
  }
});
test('active production configuration initializes the production LIFF but keeps external-browser private access locked', async () => {
  const dom = new JSDOM(
      '<header></header><p id="comments-status"></p><button id="comments-login"></button>',
      { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test' }
    ),
    w = dom.window;
  let initialized = [],
    network = 0;
  try {
    w.liff = {
      init: async (options) => {
        initialized.push(options.liffId);
      },
      isInClient: () => false,
    };
    w.fetch = async () => {
      network++;
      throw Error('unexpected network');
    };
    w.eval(read('comments-config.js'));
    w.eval(read('comments-api.js'));
    await w.DonguriComments.connect();
    assert.equal(w.DONGURI_COMMENTS_CONFIG.paused, false);
    assert.ok(initialized.length > 0);
    assert.ok(initialized.every((id) => id === '2012647452-M7eWlzdR'));
    assert.equal(network, 0);
    assert.match(
      w.document.getElementById('comments-status').textContent,
      /LINEで共有リンクを開く/
    );
    assert.equal(w.document.querySelector('.sharing-paused'), null);
    await assert.rejects(w.DonguriComments.save('/comments', 'POST', { text: 'synthetic' }));
    assert.equal(network, 0);
  } finally {
    dom.window.close();
  }
});
