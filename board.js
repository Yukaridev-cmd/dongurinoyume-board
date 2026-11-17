(function () {
  /* アプリ内ブラウザの自動ダーク化対策：配色方式をライト専用で固定 */
  try {
    document.documentElement.style.colorScheme = 'only light';
    document.documentElement.style.backgroundColor = '#fdf6e0';
    if (document.body) {
      document.body.style.colorScheme = 'only light';
      document.body.style.backgroundColor = '#fdf6e0';
    }
  } catch (e) {}
  var toast = document.getElementById('toast');
  var timer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(ta);
    });
  }
  // Navigation retains each view’s scroll position; it must never recreate comment editors.
  /* ---- view switching ---- */
  var viewIds = [
    'home',
    'events',
    'event-xmas',
    'event-tabashita',
    'event-wombat',
    'event-kiraria-1107',
    'event-kiraria-0829',
    'event-kiraria-0516',
    'event-kiraria-0228',
    'event-toyoshima',
    'event-heart',
    'works',
    'booth',
    'pops',
    'share',
    'market',
  ];
  var parentTab = {
    'event-xmas': 'events',
    'event-tabashita': 'events',
    'event-wombat': 'events',
    'event-kiraria-1107': 'events',
    'event-kiraria-0829': 'events',
    'event-kiraria-0516': 'events',
    'event-kiraria-0228': 'events',
    'event-toyoshima': 'events',
    'event-heart': 'events',
  };
  parentTab.booth = 'market';
  parentTab.pops = 'market';
  parentTab.share = 'market';
  parentTab.home = 'events';
  var settingHash = false,
    viewScroll = {};
  var menuButtons = Array.from(document.querySelectorAll('[data-view-btn]'));
  menuButtons.forEach(function (b) {
    b.id = 'tab-' + b.getAttribute('data-view-btn');
    b.setAttribute('tabindex', b.getAttribute('aria-selected') === 'true' ? '0' : '-1');
    b.setAttribute('aria-controls', 'view-' + b.getAttribute('data-view-btn'));
    b.addEventListener('keydown', function (event) {
      var index = menuButtons.indexOf(b),
        next;
      if (event.key === 'ArrowRight') next = (index + 1) % menuButtons.length;
      else if (event.key === 'ArrowLeft')
        next = (index + menuButtons.length - 1) % menuButtons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = menuButtons.length - 1;
      else return;
      event.preventDefault();
      menuButtons[next].click();
      menuButtons[next].focus({ preventScroll: true });
    });
  });
  viewIds.forEach(function (id) {
    var panel = document.getElementById('view-' + id);
    if (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'tab-' + (parentTab[id] || id));
    }
  });
  function showView(id, anchor) {
    var previousView = document.querySelector('.view.active');
    if (previousView) viewScroll[previousView.id.replace('view-', '')] = window.scrollY;
    var requested = id;
    if (window.DonguriMarket && ['booth', 'pops'].includes(id)) {
      window.DonguriMarket(id);
      id = 'market';
    }
    if (anchor) {
      var anchored = document.getElementById(anchor),
        anchoredView = anchored && anchored.closest('.view');
      if (anchoredView) id = anchoredView.id.replace(/^view-/, '');
      var marketPanel = anchored && anchored.closest('[data-market-panel]');
      if (marketPanel && window.DonguriMarket)
        window.DonguriMarket(marketPanel.dataset.marketPanel);
    }
    if (viewIds.indexOf(id) === -1) id = 'home';
    viewIds.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('active', v === id);
    });
    var tab = parentTab[id] || id;
    document.querySelectorAll('[data-view-btn]').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-view-btn') === tab ? 'true' : 'false');
      b.setAttribute('tabindex', b.getAttribute('data-view-btn') === tab ? '0' : '-1');
      b.setAttribute(
        'aria-controls',
        'view-' + (b.getAttribute('data-view-btn') === tab ? id : b.getAttribute('data-view-btn'))
      );
    });
    var target = anchor ? document.getElementById(anchor) : null;
    window.dispatchEvent(
      new CustomEvent('board-view', { detail: { id: id, requested: requested } })
    );
    if (target) {
      var disclosure = target;
      while (disclosure) {
        if (disclosure.tagName === 'DETAILS') disclosure.open = true;
        disclosure = disclosure.parentElement;
      }
      target.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo({ top: viewScroll[id] || 0, behavior: 'instant' });
    }
    try {
      settingHash = true;
      history.replaceState(null, '', '#' + (anchor || id));
      settingHash = false;
    } catch (e) {
      settingHash = false;
    }
  }
  window.DonguriBoard = { showView: showView };
  function applyHash() {
    if (settingHash) return;
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) {
      showView('events');
      return;
    }
    if (viewIds.indexOf(h) !== -1) {
      showView(h);
      return;
    }
    var el = document.getElementById(h);
    if (!el) return;
    var node = el;
    while (node && !(node.classList && node.classList.contains('view'))) node = node.parentElement;
    if (node) showView(node.id.replace(/^view-/, ''), h);
  }
  window.addEventListener('hashchange', applyHash);
  document.querySelectorAll('[data-view-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      showView(b.getAttribute('data-view-btn'));
    });
  });
  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () {
      showView(b.getAttribute('data-goto'), b.getAttribute('data-goto-anchor'));
      var heading = document.querySelector('.view.active h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });
  });
  applyHash();
  /* ---- next event countdown ---- */
  document.querySelectorAll('[data-until]').forEach(function (el) {
    var t = new Date(el.getAttribute('data-until') + 'T00:00:00');
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var d = Math.round((t - now) / 86400000);
    el.textContent = d > 0 ? 'あと' + d + '日' : d === 0 ? '当日' : '終了';
  });
  /* ---- works filter and search ---- */
  var workQuery = document.getElementById('work-search');
  function filterWorks() {
    var selected = document.querySelector('[data-filter][aria-pressed="true"]'),
      f = selected ? selected.getAttribute('data-filter') : 'all';
    var q = workQuery ? workQuery.value.trim().normalize('NFKC').toLocaleLowerCase() : '';
    var count = 0;
    document.querySelectorAll('.work[data-cat]:not([data-sale=excluded])').forEach(function (card) {
      var price = card.querySelector('.price-line'),
        match =
          f === 'unknown'
            ? price && /未確認|未登録/.test(price.textContent)
            : f === 'all' || card.getAttribute('data-cat') === f;
      var publicText = Array.from(card.querySelectorAll('h3,dl,.memo,.price-line'))
        .map(function (n) {
          return n.textContent;
        })
        .join(' ')
        .normalize('NFKC')
        .toLocaleLowerCase();
      card.hidden = !(match && (!q || publicText.includes(q)));
      if (!card.hidden) count++;
    });
    var output = document.getElementById('work-result-count');
    if (output) output.textContent = count + '作品を表示' + (count ? '' : ' ・ 条件を変えて探す');
  }
  document.querySelectorAll('[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      filterWorks();
    });
  });
  if (workQuery) workQuery.addEventListener('input', filterWorks);
  filterWorks();
  /* ---- copy ---- */
  document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!el) return;
      var txt = typeof el.value === 'string' ? el.value : el.textContent;
      copyText(txt.trim()).then(
        function () {
          showToast('コピー済み。LINEに貼れる形');
        },
        function () {
          showToast('コピー失敗');
        }
      );
    });
  });
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tpl = document.getElementById(btn.getAttribute('data-copy'));
      if (!tpl) return;
      copyText(tpl.innerHTML.trim()).then(
        function () {
          showToast('ポップの文面をコピー済み');
        },
        function () {
          showToast('コピー失敗');
        }
      );
    });
  });
  /* ---- comments: name-tagged, per item, with a summary copy ---- */
  var comments = [];
  var currentAuthor = '';
  var commentsReady = false;
  var currentViewer = '',
    boardDrafts = new Map();

  function commentInputs() {
    return Array.from(
      document.querySelectorAll('[data-memo-zone] .free-write, [data-inline-memo], #quick-text')
    );
  }
  // Clear visible private text immediately on background or denied authentication.
  // Restore only after the server returns the same viewer fingerprint.
  function protectCommentDrafts() {
    var inputs = commentInputs()
      .filter(function (ta) {
        return ta.value !== '';
      })
      .map(function (ta) {
        return { element: ta, text: ta.value, id: ta._commentId };
      });
    var edits = Array.from(document.querySelectorAll('[data-comment-editor]')).map(function (ta) {
      return {
        id: ta.getAttribute('data-comment-id'),
        version: Number(ta.getAttribute('data-comment-version')),
        text: ta.value,
      };
    });
    if (currentViewer && (inputs.length || edits.length))
      boardDrafts.set(currentViewer, { inputs: inputs, edits: edits });
    commentInputs().forEach(function (ta) {
      if (window.DonguriIME) window.DonguriIME.clear(ta);
      ta.value = '';
      delete ta._commentId;
    });
    comments = [];
    document.querySelectorAll('[data-comment-editor]').forEach(function (ta) {
      ta.removeAttribute('data-comment-editor');
    });
    renderComments();
  }
  function restoreCommentDrafts() {
    var draft = boardDrafts.get(currentViewer);
    if (!draft) return;
    draft.inputs.forEach(function (input) {
      if (input.element.isConnected) {
        input.element.value = input.text;
        if (input.id) input.element._commentId = input.id;
      }
    });
    draft.edits.forEach(function (edit) {
      var card = Array.from(document.querySelectorAll('[data-comment-card]')).find(function (node) {
        return node.getAttribute('data-comment-card') === edit.id;
      });
      var button = card && card.querySelector('[data-comment-edit]');
      if (button) {
        var completed = card.closest('.comments-completed');
        if (completed) completed.open = true;
        button.click();
        var ta = card.querySelector('[data-comment-editor]');
        ta.value = edit.text;
        ta.setAttribute('data-comment-version', String(edit.version));
      } else {
        var quick = document.getElementById('quick-text');
        if (quick) {
          quick.value += (quick.value ? '\n\n' : '') + edit.text;
          var panel = document.getElementById('quick-panel');
          if (panel) panel.hidden = false;
          var trigger = document.getElementById('quick-memo-btn');
          if (trigger) trigger.setAttribute('aria-expanded', 'true');
          showToast('元コメントが見つからず。未保存の編集をクイック欄へ復元');
        }
      }
    });
    boardDrafts.delete(currentViewer);
  }
  function makeAuthorSelect() {
    var sel = document.createElement('select');
    sel.className = 'author-sel';
    sel.setAttribute('aria-label', 'LINEで確認した投稿者');
    sel.disabled = true;
    var o = document.createElement('option');
    o.value = currentAuthor;
    o.textContent = currentAuthor || 'LINE認証を確認';
    sel.appendChild(o);
    return sel;
  }
  function setCommentAccess() {
    document.querySelectorAll('.author-sel').forEach(function (sel) {
      sel.options[0].value = currentAuthor;
      sel.options[0].textContent = currentAuthor || 'LINE認証を確認';
    });
    document
      .querySelectorAll('[data-memo-add], .inline-memo .btn, #quick-add')
      .forEach(function (btn) {
        window.DonguriUI.setDisabled(btn, !commentsReady);
      });
    document
      .querySelectorAll('[data-memo-zone] .free-write, [data-inline-memo], #quick-text')
      .forEach(function (ta) {
        window.DonguriUI.setDisabled(ta, !commentsReady);
        if (ta.maxLength !== 4000) ta.maxLength = 4000;
        if (ta.getAttribute('autocomplete') !== 'off') ta.setAttribute('autocomplete', 'off');
      });
  }
  function renderComments() {
    document.querySelectorAll('[data-memo-zone]').forEach(function (zone) {
      var list = zone.querySelector('.memo-list');
      if (list) list.setAttribute('data-comment-target', zoneTarget(zone));
    });
    document.querySelectorAll('[data-comment-target]').forEach(function (list) {
      if (list.querySelector('[data-comment-editor]')) return;
      list.replaceChildren();
      var matching = comments.filter(function (c) {
        return c.target === list.getAttribute('data-comment-target');
      });
      window.DonguriCommentState.append(list, matching, commentCard);
      var disclosure = list.closest('details.inline-memo');
      if (disclosure) {
        var summary = disclosure.querySelector('summary');
        if (summary)
          summary.textContent =
            'コメントを書く' + (matching.length ? '（' + matching.length + '件）' : '');
      }
    });
    rebuildSummary();
    window.dispatchEvent(new CustomEvent('board-comments-rendered', { detail: comments }));
  }
  window.addEventListener('comments-auth', function (event) {
    if (
      (!event.detail.ready && commentsReady) ||
      (event.detail.ready &&
        commentsReady &&
        currentViewer &&
        currentViewer !== event.detail.viewer)
    )
      protectCommentDrafts();
    commentsReady = event.detail.ready;
    currentAuthor = event.detail.author;
    if (commentsReady) currentViewer = event.detail.viewer;
    setCommentAccess();
    if (commentsReady) restoreCommentDrafts();
    rebuildSummary();
    var quickStatus = document.getElementById('quick-status');
    if (quickStatus)
      quickStatus.textContent =
        event.detail.message || (commentsReady ? currentAuthor + 'として共有中' : 'LINE認証を確認');
  });
  window.addEventListener('comments-clear', protectCommentDrafts);
  window.addEventListener('comments-suspend', protectCommentDrafts);
  window.addEventListener('beforeunload', function (event) {
    if (
      boardDrafts.size ||
      document.querySelector('[data-comment-editor]') ||
      commentInputs().some(function (ta) {
        return ta.value !== '';
      })
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('comments-loaded', function (event) {
    comments = event.detail;
    renderComments();
  });
  // Keep the same UUID on retry: an uncertain response must not create a second comment.
  // Native composition owns textarea values until it has finished.
  async function submitComment(target, ta, button) {
    if (window.DonguriIME && window.DonguriIME.active(ta)) {
      showToast('日本語の変換を確定してから保存');
      return false;
    }
    if (!commentsReady || button.disabled) return false;
    var feedback = ta.parentElement.querySelector('.comment-save-status');
    if (!feedback) {
      feedback = document.createElement('p');
      feedback.className = 'comment-help comment-save-status';
      feedback.setAttribute('role', 'status');
      ta.after(feedback);
    }
    var text = ta.value.trim();
    if (!text || text.length > 4000) {
      showToast('コメントは1〜4000文字で記入');
      return false;
    }
    button.disabled = true;
    feedback.textContent = '保存中…';
    try {
      if (!ta._commentId) ta._commentId = window.DonguriUI.newId();
      var result = await window.DonguriComments.save('/comments', 'POST', {
        id: ta._commentId,
        target: target,
        text: text,
      });
      comments = comments.filter(function (c) {
        return c.id !== result.comment.id;
      });
      comments.push(result.comment);
      // Only clear the submitted text; preserve any text typed while saving.
      if (ta.value.trim() === text && !(window.DonguriIME && window.DonguriIME.active(ta)))
        ta.value = '';
      ta._commentId = null;
      renderComments();
      feedback.textContent = 'コメント保存済み';
      showToast('コメント保存済み');
      return true;
    } catch (error) {
      feedback.textContent = error.message;
      showToast(error.message);
      return false;
    } finally {
      button.disabled = !commentsReady;
    }
  }
  function commentCard(c) {
    var card = document.createElement('article');
    card.className = 'memo-card';
    card.setAttribute('data-comment-card', c.id);
    var meta = document.createElement('div');
    meta.className = 'memo-meta';
    var who = document.createElement('span');
    who.className = 'author-badge';
    who.textContent = c.author;
    var time = document.createElement('time');
    time.dateTime = c.stamp;
    time.textContent = new Date(c.stamp).toLocaleString('ja-JP');
    meta.append(who, time);
    var body = document.createElement('div');
    body.className = 'memo-text';
    body.textContent = c.text;
    card.append(meta, body);
    if (c.resolved)
      meta.appendChild(window.DonguriUI.element('span', '対応済み', 'comment-resolved-label'));
    card.appendChild(
      window.DonguriCommentState.button(
        c,
        function (updated) {
          comments = comments.map(function (row) {
            return row.id === updated.id ? updated : row;
          });
          renderComments();
        },
        showToast,
        function () {
          if (document.querySelector('[data-comment-editor]')) {
            showToast('編集中のコメントを保存・取消してから状態を変更');
            return false;
          }
          return commentsReady;
        }
      )
    );
    var request = document.createElement('button');
    request.type = 'button';
    request.className = 'btn small';
    request.textContent = 'AIへの依頼に追加';
    request.addEventListener('click', async function () {
      request.disabled = true;
      try {
        await window.DonguriComments.save('/records', 'POST', {
          id: c.id,
          kind: 'request',
          data: { title: c.target.slice(0, 160), notes: c.text, status: '未対応' },
        });
        request.textContent = '依頼に追加済み';
        var go = document.createElement('a');
        go.href = 'private.html#kind=request';
        go.className = 'text-link';
        go.textContent = '依頼を選ぶ・コピー →';
        request.after(go);
        showToast('AIへの依頼に追加。依頼画面で選んでコピー');
      } catch (error) {
        showToast(error.message);
        request.disabled = false;
      }
    });
    card.appendChild(request);
    if (c.canEdit) {
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'memo-del';
      edit.textContent = '編集';
      edit.setAttribute('data-comment-edit', '');
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'memo-del';
      del.textContent = '消す';
      meta.append(edit, del);
      del.addEventListener('click', async function () {
        if (!window.confirm('このコメントを消す')) return;
        del.disabled = true;
        edit.disabled = true;
        try {
          await window.DonguriComments.save('/comments/' + c.id, 'DELETE', { version: c.version });
          comments = comments.filter(function (x) {
            return x.id !== c.id;
          });
          renderComments();
          showToast('コメント削除済み');
        } catch (error) {
          showToast(error.message);
        } finally {
          del.disabled = false;
          edit.disabled = false;
        }
      });
      edit.addEventListener('click', function () {
        edit.disabled = true;
        del.disabled = true;
        var ta = document.createElement('textarea');
        ta.value = c.text;
        ta.rows = 3;
        ta.maxLength = 4000;
        ta.setAttribute('aria-label', 'コメントを編集');
        ta.setAttribute('data-comment-editor', '');
        ta.setAttribute('autocomplete', 'off');
        ta.setAttribute('data-comment-id', c.id);
        ta.setAttribute('data-comment-version', String(c.version));
        var save = document.createElement('button');
        save.type = 'button';
        save.className = 'btn small';
        save.textContent = '変更を保存';
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn small';
        cancel.textContent = '取消';
        body.replaceChildren(ta, save, cancel);
        ta.focus();
        cancel.addEventListener('click', function () {
          if (window.DonguriIME && window.DonguriIME.active(ta)) {
            showToast('日本語の変換を確定してから取消');
            return;
          }
          body.textContent = c.text;
          renderComments();
        });
        save.addEventListener('click', async function () {
          if (window.DonguriIME && window.DonguriIME.active(ta)) {
            showToast('日本語の変換を確定してから保存');
            return;
          }
          save.disabled = true;
          cancel.disabled = true;
          ta.disabled = true;
          try {
            var result = await window.DonguriComments.save('/comments/' + c.id, 'PATCH', {
              version: Number(ta.getAttribute('data-comment-version')),
              text: ta.value,
            });
            comments = comments.map(function (x) {
              return x.id === c.id ? result.comment : x;
            });
            ta.removeAttribute('data-comment-editor');
            renderComments();
            showToast('変更保存済み');
          } catch (error) {
            showToast(error.message);
          } finally {
            save.disabled = false;
            cancel.disabled = false;
            ta.disabled = false;
          }
        });
      });
    }
    return card;
  }
  function groupedComments(rows) {
    var order = [];
    var map = Object.create(null);
    rows.forEach(function (c) {
      if (!map[c.target]) {
        map[c.target] = [];
        order.push(c.target);
      }
      map[c.target].push(c);
    });
    return order.map(function (t) {
      return { target: t, items: map[t] };
    });
  }
  function rebuildSummary() {
    var cnt = document.getElementById('summary-count');
    if (cnt) cnt.textContent = comments.length ? '（全' + comments.length + '件）' : '';
    var box = document.getElementById('summary-list');
    if (!box) return;
    box.innerHTML = '';
    if (!comments.length) {
      var p = document.createElement('p');
      p.className = 'summary-empty';
      p.textContent = commentsReady
        ? 'まだコメントなし。各項目のコメント欄から追加'
        : 'LINE認証と共有設定を確認してからコメントを表示';
      box.appendChild(p);
      return;
    }
    function addGroups(container, rows) {
      groupedComments(rows).forEach(function (g) {
        var div = document.createElement('div');
        div.className = 'sum-group';
        var h = document.createElement('h4');
        h.textContent = g.target;
        div.appendChild(h);
        var ul = document.createElement('ul');
        ul.className = 'sum-list';
        g.items.forEach(function (c) {
          var li = document.createElement('li');
          var b = document.createElement('b');
          b.textContent = c.author;
          li.appendChild(b);
          li.appendChild(document.createTextNode('：' + c.text));
          var t = document.createElement('time');
          t.textContent = c.stamp;
          li.appendChild(t);
          ul.appendChild(li);
        });
        div.appendChild(ul);
        container.appendChild(div);
      });
    }
    addGroups(
      box,
      comments.filter(function (c) {
        return !c.resolved;
      })
    );
    var done = comments.filter(function (c) {
      return c.resolved === true;
    });
    if (done.length) {
      var archive = window.DonguriUI.element('details', '', 'comments-completed');
      archive.appendChild(window.DonguriUI.element('summary', '対応済み（' + done.length + '件）'));
      addGroups(archive, done);
      box.appendChild(archive);
    }
  }
  /* ---- comment zones (one per page) ---- */
  function memoZoneHTML(label, hint, placeholder) {
    return (
      '<div class="memo-head"><h3>コメント</h3><span class="memo-hint">' +
      hint +
      '</span></div>' +
      '<textarea class="free-write" rows="3" placeholder="' +
      placeholder +
      '" aria-label="' +
      label +
      '"></textarea>' +
      '<div class="memo-tools"><button type="button" class="btn small" data-memo-add>コメントを追加</button></div>' +
      '<div class="memo-list"></div>'
    );
  }
  function ensureZone(viewEl, label, hint, placeholder, target) {
    if (!viewEl || viewEl.querySelector('[data-memo-zone]')) return;
    var sec = document.createElement('section');
    sec.className = 'memo-zone';
    sec.setAttribute('data-memo-zone', '');
    sec.setAttribute('aria-label', label);
    if (target) sec.setAttribute('data-target', target);
    sec.innerHTML = memoZoneHTML(label, hint, placeholder);
    viewEl.appendChild(sec);
  }
  /* every event detail page gets its own comment area */
  viewIds.forEach(function (id) {
    if (id.indexOf('event-') !== 0) return;
    var v = document.getElementById('view-' + id);
    if (!v) return;
    var h = v.querySelector('.view-head h2');
    var name = h ? h.textContent : 'このイベント';
    ensureZone(
      v,
      name + 'のコメント',
      '当日の様子・気づき・次にやることの記入欄',
      '売れたもの、来てくれた人の様子、次回の直しどころ',
      'イベント：' + name
    );
  });
  function zoneTarget(zone) {
    var t = zone.getAttribute('data-target');
    if (t) return t;
    var al = zone.getAttribute('aria-label') || '';
    return 'ページ：' + al.replace(/の(メモ|コメント)$/, '');
  }
  function setupZone(zone) {
    var help = document.createElement('p');
    help.className = 'comment-help';
    help.textContent = '保存 → AIへの依頼に追加 → 依頼画面で選択・コピー。AIへ自動送信なし。';
    zone.appendChild(help);
    var input = zone.querySelector('.free-write');
    if (input)
      input.setAttribute('aria-label', zone.getAttribute('aria-label') || 'このページのコメント');
    var head = zone.querySelector('.memo-head h3');
    if (head) head.textContent = 'コメント';
    zone.querySelectorAll('[data-memo-copy]').forEach(function (b) {
      b.remove();
    });
    var tools = zone.querySelector('.memo-tools');
    if (!tools) return;
    var addBtn = zone.querySelector('[data-memo-add]');
    if (addBtn) addBtn.textContent = 'コメントを追加';
    if (!tools.querySelector('.author-sel'))
      tools.insertBefore(makeAuthorSelect(), tools.firstChild);
    if (addBtn && !addBtn.getAttribute('data-bound')) {
      addBtn.setAttribute('data-bound', '1');
      addBtn.addEventListener('click', function () {
        var ta = zone.querySelector('.free-write');
        if (!ta || !ta.value.trim()) {
          if (ta) ta.focus();
          showToast('先にコメント欄への記入が必要');
          return;
        }
        submitComment(zoneTarget(zone), ta, addBtn);
      });
    }
  }
  document.querySelectorAll('[data-memo-zone]').forEach(setupZone);
  /* ---- inline comments on each work card, pop entry and event card ---- */
  function addInlineComment(container, target, placeholder) {
    if (!container || container.querySelector('.inline-memo')) return;
    var wrap = document.createElement('details');
    wrap.className = 'inline-memo';
    var disclosure = document.createElement('summary');
    disclosure.textContent = 'コメントを書く';
    wrap.appendChild(disclosure);
    var lab = document.createElement('span');
    lab.textContent = 'コメント';
    wrap.appendChild(lab);
    var ta = document.createElement('textarea');
    ta.rows = 2;
    ta.placeholder = placeholder;
    ta.setAttribute('data-inline-memo', '');
    ta.setAttribute('aria-label', target + 'のコメント');
    wrap.appendChild(ta);
    var help = document.createElement('p');
    help.className = 'comment-help';
    help.textContent = '保存後、コメントの「AIへの依頼に追加」からまとめる。AIへ自動送信なし。';
    wrap.appendChild(help);
    var row = document.createElement('div');
    row.className = 'cmt-row';
    row.appendChild(makeAuthorSelect());
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = 'コメントを追加';
    row.appendChild(btn);
    wrap.appendChild(row);
    var list = document.createElement('div');
    list.className = 'memo-list';
    list.setAttribute('data-comment-target', target);
    wrap.appendChild(list);
    btn.addEventListener('click', function () {
      if (!ta.value.trim()) {
        ta.focus();
        showToast('先にコメント記入が必要');
        return;
      }
      submitComment(target, ta, btn);
    });
    container.appendChild(wrap);
  }
  document.querySelectorAll('.work .body').forEach(function (body) {
    var card = body.closest('.work');
    var h = card ? card.querySelector('h3') : null;
    if (card && !body.querySelector('.photo-caption')) {
      var caption = document.createElement('p');
      caption.className = 'photo-caption';
      caption.textContent =
        card.id === 'work-happy-pack'
          ? 'ポップ画像。セットの実物写真と中身は確認待ち'
          : card.querySelector('[data-photo-alias]')
            ? '同じ作品の写真は大きいあみぐるみに統合'
            : card.querySelector('img')
              ? '既存の作品・展示写真。現在の在庫と仕様は別途確認'
              : '対応する実物写真は確認待ち';
      body.appendChild(caption);
    }
    addInlineComment(
      body,
      '作品：' + (card.dataset.commentName || (h ? h.textContent : '作品')),
      '価格・在庫・作る数・直すところなど'
    );
    if (h) {
      var inventoryLink = document.createElement('a');
      inventoryLink.className = 'text-link';
      inventoryLink.href = 'private.html#inventory=' + encodeURIComponent(h.textContent);
      inventoryLink.textContent = 'この作品の棚卸メモを書く →';
      body.appendChild(inventoryLink);
    }
  });
  document.querySelectorAll('.pop-entry .foot').forEach(function (foot) {
    var entry = foot.closest('.pop-entry');
    var h = entry ? entry.querySelector('.head h3') : null;
    addInlineComment(
      foot,
      'ポップ：' + (h ? h.textContent : 'ポップ'),
      '直したい文字、印刷サイズ、置く場所'
    );
  });
  document.querySelectorAll('.event-card .body').forEach(function (body) {
    var card = body.closest('.event-card');
    var h = card ? card.querySelector('h3') : null;
    var date = card ? card.querySelector('.meta .m-line') : null;
    var t =
      'イベント：' +
      (h ? h.textContent : 'イベント') +
      (date ? '（' + date.textContent + '）' : '');
    addInlineComment(body, t, 'このイベントについてのコメント');
  });
  /* ---- private comment overview ---- */
  rebuildSummary();
  /* ---- quick comment panel: write from any page ---- */
  var qBtn = document.getElementById('quick-memo-btn');
  var qPanel = document.getElementById('quick-panel');
  var qText = document.getElementById('quick-text');
  if (qText) qText.setAttribute('aria-label', '表示中のページへのコメント');
  var homeComment = document.getElementById('home-comment');
  if (homeComment)
    homeComment.addEventListener('click', function () {
      if (qPanel) {
        qPanel.hidden = false;
        qBtn.setAttribute('aria-expanded', 'true');
        qText.focus();
      }
    });
  if (location.hash === '#comments' && qPanel) {
    qPanel.hidden = false;
    qBtn.setAttribute('aria-expanded', 'true');
  }
  function closeQuick() {
    if (qPanel) qPanel.hidden = true;
    if (qBtn) {
      qBtn.setAttribute('aria-expanded', 'false');
      qBtn.focus();
    }
  }
  if (qBtn && qPanel) {
    qBtn.addEventListener('click', function () {
      var open = qPanel.hidden;
      qPanel.hidden = !open;
      qBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && qText) qText.focus();
    });
  }
  if (qPanel) {
    qPanel.setAttribute('role', 'region');
    qPanel.setAttribute('aria-label', 'コメントの入力');
    qPanel.addEventListener('keydown', function (event) {
      if (
        event.key === 'Escape' &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !(window.DonguriIME && window.DonguriIME.active(qText))
      ) {
        event.preventDefault();
        closeQuick();
      }
    });
    var qTools = qPanel.querySelector('.memo-tools');
    if (qTools && !qTools.querySelector('.author-sel'))
      qTools.insertBefore(makeAuthorSelect(), qTools.firstChild);
  }
  var qClose = document.getElementById('quick-close');
  if (qClose) qClose.addEventListener('click', closeQuick);
  var qAdd = document.getElementById('quick-add');
  if (qAdd) {
    qAdd.addEventListener('click', function () {
      if (!qText || !qText.value.trim()) {
        if (qText) qText.focus();
        showToast('先にコメント記入が必要');
        return;
      }
      var active = document.querySelector('.view.active');
      var zone = active
        ? active.querySelector('[data-market-panel]:not([hidden]) [data-memo-zone]') ||
          active.querySelector('[data-memo-zone]')
        : null;
      submitComment(zone ? zoneTarget(zone) : 'ページ：その他', qText, qAdd).then(function (saved) {
        if (saved) {
          closeQuick();
          if (zone) zone.scrollIntoView({ block: 'center' });
        }
      });
    });
  }
  setCommentAccess();
})();
