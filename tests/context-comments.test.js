import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const source = readFileSync(new URL('../context-comments.js', import.meta.url), 'utf8'),
  tick = () => new Promise((r) => setTimeout(r, 10));
function fixture() {
  const errors = [],
    calls = [];
  let fail = false,
    hold = null;
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e));
  const dom = new JSDOM('<section id="context-comments"></section>', {
      url: 'https://test.example/private.html',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc,
    }),
    w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.confirm = () => true;
  w.DonguriComments = {
    save: async (path, method, body) => {
      calls.push({ path, method, body });
      if (hold) await hold;
      if (fail) throw Error('架空の通信失敗');
      return method === 'PATCH' && path.startsWith('/comments/')
        ? {
            comment: {
              id: path.split('/').at(-1),
              target: '記録：test',
              text: '架空の完了依頼',
              author: '妻',
              stamp: '2026-01-01',
              version: body.version + 1,
              resolved: body.resolved,
            },
          }
        : path === '/comments'
          ? { comment: { ...body, author: '本人', stamp: '2026-11-17', version: 1 } }
          : { record: { ...body } };
    },
  };
  w.eval(readFileSync(new URL('../ime.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../ui-core.js', import.meta.url), 'utf8'));
  w.eval(readFileSync(new URL('../comment-state.js', import.meta.url), 'utf8'));
  w.eval(source);
  const button = w.DonguriContextComments.button('記録：test', '非公開の架空作業', 'event-xmas');
  w.document.body.appendChild(button);
  return {
    w,
    dom,
    errors,
    calls,
    button,
    host: w.document.querySelector('section'),
    input: w.document.querySelector('textarea'),
    save: w.document.querySelector('.primary'),
    set fail(v) {
      fail = v;
    },
    set hold(v) {
      hold = v;
    },
    auth(viewer = 'a'.repeat(64)) {
      w.dispatchEvent(new w.CustomEvent('comments-auth', { detail: { ready: true, viewer } }));
    },
    suspend() {
      w.dispatchEvent(new w.Event('comments-suspend'));
    },
  };
}
test('targeted completion stays below pending comments, preserves composing drafts and fails without changing state', async () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    b.w.dispatchEvent(
      new b.w.CustomEvent('comments-loaded', {
        detail: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            target: '記録：test',
            text: '架空の完了依頼',
            author: '妻',
            stamp: '2026-01-01',
            version: 1,
          },
        ],
      })
    );
    b.input.value = 'て';
    b.input.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true }));
    b.fail = true;
    b.host.querySelector('[data-comment-state]').click();
    await tick();
    assert.equal(b.host.querySelector('.comments-completed'), null);
    assert.match(b.host.textContent, /架空の通信失敗/);
    assert.equal(b.input.value, 'て');
    b.fail = false;
    b.host.querySelector('[data-comment-state]').click();
    await tick();
    assert.match(b.host.querySelector('.comments-completed').textContent, /架空の完了依頼/);
    assert.equal(b.input.value, 'て');
    b.suspend();
    assert.equal(b.host.textContent.includes('架空の完了依頼'), false);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('targeted comment drafts disappear on suspension and restore only for the verified same viewer', async () => {
  const b = fixture();
  try {
    b.button.click();
    assert.equal(b.input.disabled, true);
    assert.equal(b.calls.length, 0);
    b.auth();
    b.button.click();
    b.input.value = '秘密の下書き';
    b.input.dispatchEvent(new b.w.Event('input'));
    b.suspend();
    assert.equal(b.host.hidden, true);
    assert.equal(b.input.value, '');
    assert.equal(b.host.textContent.includes('非公開の架空作業'), false);
    b.auth('b'.repeat(64));
    assert.equal(b.input.value, '');
    b.suspend();
    b.auth();
    assert.equal(b.input.value, '秘密の下書き');
    assert.equal(b.host.hidden, false);
    assert.equal(b.w.localStorage.length, 0);
    assert.equal(b.w.sessionStorage.length, 0);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('failed targeted saves preserve text and id; successful comments become requests only after explicit choice', async () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    b.input.value = '<img src=x>架空の依頼';
    b.fail = true;
    b.save.click();
    await tick();
    assert.equal(b.input.value, '<img src=x>架空の依頼');
    b.fail = false;
    b.save.click();
    await tick();
    assert.equal(b.calls[0].body.id, b.calls[1].body.id);
    assert.equal(b.calls[1].body.target, '記録：test');
    assert.equal(b.host.querySelectorAll('img').length, 0);
    assert.equal(b.calls.filter((c) => c.path === '/records').length, 0);
    [...b.host.querySelectorAll('button')]
      .find((n) => n.textContent === 'AIへの依頼に追加')
      .click();
    await tick();
    assert.equal(b.calls.at(-1).body.data.eventId, 'event-xmas');
    assert.equal(b.calls.at(-1).body.data.notes, '<img src=x>架空の依頼');
    let opened = false;
    b.w.addEventListener('open-ai-requests', () => (opened = true));
    b.host.querySelector('a').click();
    assert.equal(opened, true);
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('late targeted saves cannot reveal content after lock and reuse the pending id on retry', async () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    b.input.value = '遅い保存の架空本文';
    let release;
    b.hold = new Promise((r) => (release = r));
    b.save.click();
    const id = b.calls[0].body.id;
    b.suspend();
    release();
    await tick();
    assert.equal(b.host.textContent.includes('遅い保存'), false);
    assert.equal(b.input.value, '');
    b.hold = null;
    b.auth();
    assert.equal(b.input.value, '遅い保存の架空本文');
    b.save.click();
    await tick();
    assert.equal(b.calls[1].body.id, id);
    assert.equal(b.input.value, '');
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('switching target cannot silently discard a draft and periodic auth does not duplicate it', () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    b.input.value = '編集中';
    b.w.confirm = () => false;
    const other = b.w.DonguriContextComments.button('記録：other', '別の項目');
    other.click();
    assert.equal(b.input.value, '編集中');
    assert.ok(b.host.textContent.includes('非公開の架空作業'));
    b.auth();
    assert.equal(b.input.value, '編集中');
    assert.equal(b.calls.length, 0);
  } finally {
    b.dom.window.close();
  }
});

test('native Japanese input never resets editor attributes, value, selection or focus on each input', async () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    const ta = b.input,
      proto = b.w.HTMLTextAreaElement.prototype;
    let disabledWrites = 0,
      valueWrites = 0;
    const disabled = Object.getOwnPropertyDescriptor(proto, 'disabled'),
      value = Object.getOwnPropertyDescriptor(proto, 'value');
    Object.defineProperty(ta, 'disabled', {
      get() {
        return disabled.get.call(this);
      },
      set(v) {
        disabledWrites++;
        disabled.set.call(this, v);
      },
    });
    Object.defineProperty(ta, 'value', {
      get() {
        return value.get.call(this);
      },
      set(v) {
        valueWrites++;
        value.set.call(this, v);
      },
    });
    ta.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true }));
    value.set.call(ta, 'て');
    ta.setSelectionRange(1, 1);
    const attrs = ta.getAttributeNames().map((n) => [n, ta.getAttribute(n)]);
    ta.dispatchEvent(
      new b.w.InputEvent('beforeinput', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
        data: 'て',
      })
    );
    ta.dispatchEvent(
      new b.w.InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
        data: 'て',
      })
    );
    value.set.call(ta, 'てすと');
    ta.setSelectionRange(3, 3);
    ta.dispatchEvent(
      new b.w.InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
        data: 'てすと',
      })
    );
    b.auth();
    assert.equal(disabledWrites, 0);
    assert.equal(valueWrites, 0);
    assert.deepEqual(
      ta.getAttributeNames().map((n) => [n, ta.getAttribute(n)]),
      attrs
    );
    assert.equal(ta.selectionStart, 3);
    assert.equal(b.w.document.activeElement, ta);
    assert.equal(ta.value, 'てすと');
    b.save.click();
    await tick();
    assert.equal(b.calls.length, 0);
    ta.dispatchEvent(new b.w.CompositionEvent('compositionend', { bubbles: true, data: 'テスト' }));
    value.set.call(ta, 'テスト');
    ta.dispatchEvent(
      new b.w.InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromComposition',
        isComposing: false,
        data: 'テスト',
      })
    );
    await tick();
    b.save.click();
    await tick();
    assert.equal(b.calls.length, 1);
    assert.equal(b.calls[0].body.text, 'テスト');
    assert.equal(ta.value, '');
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
test('Android input sequences without compositionstart and with compositionend before final input are protected', async () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    const ta = b.input;
    ta.value = 'あ';
    ta.dispatchEvent(
      new b.w.InputEvent('beforeinput', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
      })
    );
    ta.dispatchEvent(
      new b.w.InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
      })
    );
    assert.equal(b.w.DonguriIME.active(ta), true);
    b.save.click();
    await tick();
    assert.equal(b.calls.length, 0);
    ta.dispatchEvent(new b.w.CompositionEvent('compositionend', { bubbles: true }));
    ta.value = '愛';
    ta.dispatchEvent(
      new b.w.InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        isComposing: true,
      })
    );
    await tick();
    assert.equal(b.w.DonguriIME.active(ta), false);
    b.save.click();
    await tick();
    assert.equal(b.calls[0].body.text, '愛');
    ta.value = '次';
    ta.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true }));
    ta.dispatchEvent(new b.w.FocusEvent('focusout', { bubbles: true }));
    await tick();
    assert.equal(b.w.DonguriIME.active(ta), false);
    assert.equal(ta.value, '次');
  } finally {
    b.dom.window.close();
  }
});
test('composition protection never delays hiding private text on authentication loss', async () => {
  const b = fixture();
  try {
    b.auth();
    b.button.click();
    b.input.value = '保護する合成下書き';
    b.input.dispatchEvent(new b.w.CompositionEvent('compositionstart', { bubbles: true }));
    b.suspend();
    assert.equal(b.input.value, '');
    assert.equal(b.host.hidden, true);
    assert.equal(b.w.DonguriIME.active(b.input), false);
    b.auth('b'.repeat(64));
    assert.equal(b.input.value, '');
    b.suspend();
    b.auth();
    assert.equal(b.input.value, '保護する合成下書き');
    assert.equal(b.errors.length, 0);
  } finally {
    b.dom.window.close();
  }
});
