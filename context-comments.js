(function () {
  'use strict';
  // One targeted editor per private page. Drafts stay in memory, bound to the
  // server-verified viewer. Titles and text never enter URLs or browser storage.
  var ready = false,
    viewer = '',
    epoch = 0,
    rows = [],
    context = null,
    vault = new Map(),
    pending = false;
  var host = document.getElementById('context-comments');
  if (!host) return;
  var el = window.DonguriUI.element;
  var heading = el('h3', 'コメント'),
    target = el('p'),
    input = el('textarea'),
    save = el('button', 'コメントを保存'),
    close = el('button', '閉じる'),
    message = el('p'),
    list = el('div'),
    help = el('p', '保存後「AIへの依頼に追加」→ 依頼画面で選択・コピー。AIへ自動送信なし。');
  host.hidden = true;
  host.className = 'context-comments';
  target.className = 'comment-target';
  input.rows = 3;
  input.maxLength = 4000;
  input.autocomplete = 'off';
  input.placeholder = '気づいたこと・直してほしいこと';
  input.setAttribute('aria-label', '対象へのコメント');
  input.disabled = true;
  save.type = close.type = 'button';
  save.disabled = true;
  save.className = 'primary';
  message.setAttribute('role', 'status');
  help.className = 'comment-help';
  var actions = el('div');
  actions.className = 'actions';
  actions.append(save, close);
  host.append(heading, target, input, actions, message, help, list);
  // An input event may update draft state, but must not rewrite the native editor
  // or its sibling label while Android/Simeji is composing the first character.
  function dirty() {
    var next = ready && !!input.value;
    if (host.hasAttribute('data-private-dirty') !== next)
      host.toggleAttribute('data-private-dirty', next);
  }
  function sync() {
    window.DonguriUI.setDisabled(input, !ready);
    var disabled = !ready || pending;
    window.DonguriUI.setDisabled(save, disabled);
    var label = context ? '対象：' + context.label : '';
    if (target.textContent !== label) target.textContent = label;
    dirty();
  }
  // Authentication loss takes precedence over composition: hide text now and
  // retain only an in-memory, viewer-bound draft for later verification.
  function protect() {
    if (viewer && context && (input.value || input._commentId))
      vault.set(viewer, {
        context: { ...context },
        text: input.value,
        id: input._commentId,
        open: !host.hidden,
      });
    ready = false;
    epoch++;
    pending = false;
    context = null;
    rows = [];
    if (window.DonguriIME) window.DonguriIME.clear(input);
    input.value = '';
    input._commentId = null;
    target.textContent = '';
    list.replaceChildren();
    message.textContent = '';
    host.hidden = true;
    sync();
  }
  function render() {
    list.replaceChildren();
    if (!ready || !context) return;
    window.DonguriCommentState.append(
      list,
      rows.filter((c) => c.target === context.target),
      function (c) {
        var card = el('article'),
          meta = el('p', c.author),
          text = el('p', c.text),
          request = el('button', 'AIへの依頼に追加');
        card.className = 'context-comment-item';
        request.type = 'button';
        request.addEventListener('click', async function () {
          if (!ready) return;
          var generation = epoch,
            title = context.label,
            eventId = context.eventId || '';
          request.disabled = true;
          try {
            await window.DonguriComments.save('/records', 'POST', {
              id: c.id,
              kind: 'request',
              data: {
                title: title.slice(0, 160),
                notes: c.text,
                status: '未対応',
                ...(eventId ? { eventId } : {}),
              },
            });
            if (generation !== epoch || !ready) return;
            request.textContent = '依頼に追加済み';
            var go = el('a', '依頼を選ぶ・コピー →');
            go.href = 'private.html#kind=request';
            go.addEventListener('click', function (e) {
              if (location.pathname.endsWith('/private.html')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('open-ai-requests'));
              }
            });
            go.className = 'text-link';
            request.after(go);
          } catch (error) {
            if (generation === epoch && ready) {
              message.textContent = error.message;
              request.disabled = false;
            }
          }
        });
        card.append(meta, text, request);
        if (c.resolved) meta.appendChild(el('span', ' 対応済み', 'comment-resolved-label'));
        card.appendChild(
          window.DonguriCommentState.button(
            c,
            function (updated) {
              rows = rows.map(function (row) {
                return row.id === updated.id ? updated : row;
              });
              render();
            },
            function (text) {
              if (ready) message.textContent = text;
            },
            function () {
              return ready;
            }
          )
        );
        return card;
      }
    );
  }
  window.DonguriContextComments = {
    button: function (targetId, label, eventId) {
      var b = el('button', 'コメントを書く');
      b.type = 'button';
      b.className = 'context-comment-trigger';
      b.dataset.icon = 'comment';
      b.setAttribute('aria-label', label + 'にコメントを書く');
      b.addEventListener('click', function () {
        if (!ready) {
          host.hidden = false;
          message.textContent = 'コメントはLINE認証・共有設定後に利用';
          sync();
          host.scrollIntoView({ block: 'center' });
          return;
        }
        if (pending) {
          message.textContent = '保存結果を確認してから対象を変更';
          return;
        }
        if (
          context &&
          context.target !== targetId &&
          input.value &&
          !window.confirm('未保存のコメントを取消して別の対象に書く')
        )
          return;
        if (!context || context.target !== targetId) {
          input.value = '';
          input._commentId = null;
        }
        context = { target: targetId, label: label, eventId: eventId || '' };
        host.hidden = false;
        message.textContent = '';
        sync();
        render();
        host.scrollIntoView({ block: 'center' });
        input.focus();
      });
      return b;
    },
  };
  input.addEventListener('input', dirty);
  close.addEventListener('click', function () {
    if (window.DonguriIME && window.DonguriIME.active(input)) {
      message.textContent = '日本語の変換を確定してから閉じる';
      return;
    }
    host.hidden = true;
  });
  save.addEventListener('click', async function () {
    if (!ready || pending || !context) return;
    if (window.DonguriIME && window.DonguriIME.active(input)) {
      message.textContent = '日本語の変換を確定してから保存';
      return;
    }
    var text = input.value.trim();
    if (!text) {
      message.textContent = 'コメントを記入';
      return;
    }
    var generation = epoch,
      which = context.target;
    input._commentId = input._commentId || window.DonguriUI.newId();
    pending = true;
    sync();
    message.textContent = '保存中';
    try {
      var result = await window.DonguriComments.save('/comments', 'POST', {
        id: input._commentId,
        target: which,
        text: text,
      });
      if (generation !== epoch || !ready) return;
      rows = rows.filter((c) => c.id !== result.comment.id).concat(result.comment);
      if (input.value.trim() === text && !(window.DonguriIME && window.DonguriIME.active(input)))
        input.value = '';
      input._commentId = null;
      message.textContent = '保存済み。AIに渡す内容は下のボタンで依頼に追加';
      render();
    } catch (error) {
      if (generation === epoch && ready) message.textContent = error.message;
    } finally {
      if (generation === epoch) {
        pending = false;
        sync();
      }
    }
  });
  window.addEventListener('comments-loaded', function (e) {
    rows = e.detail;
    render();
  });
  window.addEventListener('comments-auth', function (e) {
    if (!e.detail.ready) {
      if (ready) protect();
      return;
    }
    if (!/^[0-9a-f]{64}$/.test(e.detail.viewer || '')) {
      protect();
      return;
    }
    if (viewer && viewer !== e.detail.viewer) {
      var incoming = rows;
      protect();
      rows = incoming;
    }
    viewer = e.detail.viewer;
    ready = true;
    var draft = vault.get(viewer);
    if (draft) {
      context = draft.context;
      input.value = draft.text;
      input._commentId = draft.id;
      host.hidden = !draft.open;
      vault.delete(viewer);
      message.textContent = '未保存コメントを復元';
    }
    sync();
    render();
  });
  window.addEventListener('comments-clear', protect);
  window.addEventListener('comments-suspend', protect);
  window.addEventListener('beforeunload', function (e) {
    if (input.value || vault.size) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
