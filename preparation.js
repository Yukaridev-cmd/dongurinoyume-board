(function () {
  'use strict';
  // Public facts and private summaries are separate. No input editor is replaced
  // by a refresh, and no private state is persisted in browser storage.
  var el = window.DonguriUI.element,
    ready = false,
    epoch = 0,
    rows = [];
  var candidates = [...document.querySelectorAll('#view-events .event-card')]
    .map(function (card) {
      var button = card.querySelector('[data-goto^="event-"]');
      var date = card.textContent.match(/(20\d\d)年(\d+)月(\d+)日/);
      return {
        card: card,
        id: button?.dataset.goto,
        date: date ? date[1] + '-' + date[2].padStart(2, '0') + '-' + date[3].padStart(2, '0') : '',
      };
    })
    .filter(function (item) {
      return item.id && item.date >= new Date().toISOString().slice(0, 10);
    })
    .sort(function (a, b) {
      return a.date.localeCompare(b.date);
    });
  var next = candidates[0],
    hero = el('section', '', 'next-preparation');
  hero.appendChild(el('h3', '次の出店'));
  var progress = el('p', 'LINEで準備状況を確認', 'preparation-progress');
  if (next) {
    hero.appendChild(next.card);
    var actions = el('div', '', 'workflow-actions');
    [
      ['持参作品・ポップ', 'event.html#id=' + next.id],
      ['準備すること', 'private.html#kind=task&event=' + next.id],
      ['確認待ちの依頼', 'private.html#kind=request&event=' + next.id],
      ['振り返り', 'private.html#kind=review&event=' + next.id],
    ].forEach(function (pair) {
      var a = el('a', pair[0], 'workflow-action');
      a.href = pair[1];
      actions.appendChild(a);
    });
    hero.append(actions, progress);
  } else hero.appendChild(el('p', '次の出店は未登録'));
  document.querySelector('#view-events .view-head').after(hero);
  var stocks = new Map();
  // A stable status node and parent-only dirty flag avoid rewriting the native IME editor.
  var editors = [...document.querySelectorAll('[data-inline-memo],.free-write,#quick-text')];
  editors.forEach(function (input) {
    var state = el('p', '', 'draft-save-state');
    state.setAttribute('aria-label', '入力がある場合は未保存');
    input.after(state);
    input.addEventListener('input', function () {
      input.parentElement.toggleAttribute('data-has-draft', !!input.value);
    });
  });
  document.querySelectorAll('.work').forEach(function (card) {
    var body = card.querySelector('.body'),
      facts = el('p', '在庫：未登録 · 次回持参数：未登録', 'work-preparation-facts');
    facts.dataset.productFacts = card.id;
    var price = body.querySelector(':scope > .price-line');
    (price || body.querySelector('h3')).after(facts);
    stocks.set(card.querySelector('h3').textContent, facts);
  });
  function previews() {
    editors.forEach(function (input) {
      input.parentElement.toggleAttribute('data-has-draft', !!input.value);
    });
    document.querySelectorAll('.comment-peek').forEach(function (n) {
      n.remove();
    });
    if (!ready) return;
    document.querySelectorAll('.work,.event-card,.pop-entry').forEach(function (card) {
      var list = card.querySelector('[data-comment-target]');
      if (!list) return;
      var matching = rows
        .filter(function (c) {
          return c.target === list.dataset.commentTarget;
        })
        .sort(function (a, b) {
          return b.stamp.localeCompare(a.stamp);
        });
      var pending = matching.filter(function (c) {
        return !c.resolved;
      });
      var button = el(
        'button',
        '未対応 ' +
          pending.length +
          '件' +
          (matching.length ? ' · 最新：' + matching[0].text.replace(/\s+/g, ' ').slice(0, 45) : ''),
        'comment-peek'
      );
      button.type = 'button';
      button.addEventListener('click', function () {
        var box = list.closest('details');
        if (box) box.open = true;
        var done = list.querySelector('.comments-completed');
        if (done && !pending.length) done.open = true;
        list.scrollIntoView({ block: 'center' });
      });
      card.querySelector('.body').appendChild(button);
    });
  }
  function clear() {
    ready = false;
    epoch++;
    rows = [];
    previews();
    progress.textContent = 'LINEで準備状況を確認';
    stocks.forEach(function (node) {
      node.textContent = '在庫：未登録 · 次回持参数：未登録';
    });
  }
  window.addEventListener('board-comments-rendered', function (e) {
    rows = e.detail;
    previews();
  });
  window.addEventListener('comments-auth', async function (e) {
    if (!e.detail.ready) {
      clear();
      return;
    }
    ready = true;
    previews();
    var generation = ++epoch;
    try {
      var records = [],
        cursor = '';
      do {
        var result = await window.DonguriComments.save(
          '/records' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
          'GET'
        );
        records = records.concat(result.records);
        cursor = result.next;
      } while (cursor);
      if (!ready || generation !== epoch) return;
      if (next) {
        var tasks = records.filter(function (r) {
          return r.kind === 'task' && r.data.eventId === next.id;
        });
        progress.textContent =
          '準備 ' +
          tasks.filter(function (r) {
            return r.data.status === '完了';
          }).length +
          '/' +
          tasks.length +
          '件完了 · 未完了 ' +
          tasks.filter(function (r) {
            return r.data.status !== '完了';
          }).length +
          '件';
      }
      stocks.forEach(function (node, title) {
        var matches = records
          .filter(function (r) {
            return r.kind === 'inventory' && r.data.title === title;
          })
          .sort(function (a, b) {
            return b.updatedAt.localeCompare(a.updatedAt);
          });
        var stock = matches[0]?.data.stock;
        node.textContent =
          '在庫：' + (stock == null ? '未登録' : stock + '（棚卸メモ）') + ' · 次回持参数：未登録';
      });
    } catch {
      if (ready && generation === epoch)
        progress.textContent = '準備状況の取得失敗。再読込で再確認';
    }
  });
  window.addEventListener('comments-clear', clear);
  window.addEventListener('comments-suspend', clear);
})();
