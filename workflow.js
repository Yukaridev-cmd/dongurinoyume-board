(function () {
  'use strict';
  var el = window.DonguriUI.element;
  function keepControl(control, change) {
    var top = control.getBoundingClientRect().top;
    change();
    var delta = control.getBoundingClientRect().top - top;
    if (delta) window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
  }
  function link(label, href, icon) {
    var a = el('a', label, 'workflow-action');
    a.href = href;
    a.dataset.icon = icon;
    return a;
  }
  function recordLink(kind, id) {
    return 'private.html#kind=' + kind + '&event=' + encodeURIComponent(id);
  }
  // Rearrange existing nodes instead of cloning: IDs and comment targets remain unique.
  var market = document.getElementById('view-market');
  ['pops', 'booth'].forEach(function (name) {
    var source = document.getElementById('view-' + name),
      panel = market.querySelector('[data-market-panel=' + name + ']');
    Array.from(source.children).forEach(function (n) {
      panel.appendChild(n);
    });
  });
  window.DonguriMarket = function (name) {
    market.querySelectorAll('[data-market-panel]').forEach(function (p) {
      p.hidden = p.dataset.marketPanel !== name;
    });
    market.querySelectorAll('[data-market]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.market === name));
    });
  };
  market.querySelectorAll('[data-market]').forEach(function (b) {
    b.addEventListener('click', function () {
      keepControl(b, function () {
        window.DonguriMarket(b.dataset.market);
      });
    });
  });
  // Move existing nodes, including comments; never duplicate their targets or contents.
  var popPanel = market.querySelector('[data-market-panel=pops]'),
    popGrid = el('div', null, 'work-grid pop-grid');
  popPanel.appendChild(popGrid);
  document.querySelectorAll('.pop-entry').forEach(function (card) {
    var head = card.querySelector('.head'),
      media = el('div', null, 'pop-media'),
      body = el('div', null, 'body'),
      more = el('details', null, 'work-more'),
      comment = card.querySelector('.inline-memo');
    more.appendChild(el('summary', '詳細・文面'));
    Array.from(card.children)
      .filter(function (n) {
        return n.matches('.fig,.pop');
      })
      .forEach(function (n) {
        media.appendChild(n);
      });
    if (media.children.length > 1) media.classList.add('pop-media-multiple');
    body.appendChild(head);
    Array.from(card.children)
      .filter(function (n) {
        return n !== comment;
      })
      .forEach(function (n) {
        more.appendChild(n);
      });
    body.appendChild(more);
    if (comment) body.appendChild(comment);
    card.append(media, body);
    popGrid.appendChild(card);
  });
  document.querySelectorAll('.work').forEach(function (card) {
    var body = card.querySelector('.body');
    if (!body) return;
    var more = el('details', null, 'work-more'),
      summary = el('summary', '詳細・棚卸');
    more.appendChild(summary);
    Array.from(body.children)
      .filter(function (n) {
        return !n.matches('h3,.price,.price-line,.inline-memo');
      })
      .forEach(function (n) {
        more.appendChild(n);
      });
    var comment = body.querySelector('.inline-memo');
    if (comment) body.insertBefore(more, comment);
    else body.appendChild(more);
  });
  document.querySelectorAll('main[id^="view-event-"]').forEach(function (view) {
    var id = view.id.replace('view-', ''),
      head = view.querySelector('.view-head'),
      facts = view.querySelector(':scope > .facts'),
      memo = view.querySelector('[data-memo-zone]');
    var original = Array.from(view.children).filter(function (n) {
      return n !== head && n !== facts && n !== memo && !n.matches('.backlink,.view-lead');
    });
    var gallery = el('section', null, 'event-photo-gallery');
    gallery.setAttribute('aria-label', 'この出店の写真');
    var photoGroups = Array.from(view.querySelectorAll(':scope > .photo-grid'));
    var photoCount = photoGroups.reduce(function (total, g) {
      return total + g.querySelectorAll('img').length;
    }, 0);
    gallery.appendChild(
      el('h3', '写真' + (photoCount ? '（' + photoCount + '枚）' : ''), 'subhead')
    );
    var photoGrid = el('div', null, 'event-photo-grid');
    photoGroups.forEach(function (group) {
      var groupHead = group.previousElementSibling;
      if (groupHead && groupHead.matches('h3')) {
        original = original.filter((n) => n !== groupHead);
        var label = el('h4', groupHead.textContent, 'photo-group-label');
        photoGrid.appendChild(label);
        groupHead.remove();
      }
      Array.from(group.children).forEach(function (figure) {
        var img = figure.querySelector('img');
        if (img) {
          var a = img.closest('a') || el('a');
          a.href = img.getAttribute('src');
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.setAttribute(
            'aria-label',
            (figure.querySelector('figcaption')?.textContent || img.alt) + 'を大きく見る'
          );
          if (img.parentElement !== a) {
            img.before(a);
            a.appendChild(img);
          }
        }
        photoGrid.appendChild(figure);
      });
      original = original.filter((n) => n !== group);
      group.remove();
    });
    if (photoCount) {
      gallery.appendChild(
        el(
          'p',
          photoGrid.querySelector('.board-photo-card')
            ? '追加写真の撮影日・開催回は各見出しを確認。'
            : '出店当時の記録。現在の販売候補は「作品・在庫」で確認。',
          'workflow-note'
        )
      );
      gallery.appendChild(photoGrid);
    } else gallery.appendChild(el('p', '写真はまだ未登録', 'workflow-note'));
    var tabs = el('div', null, 'event-phases');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '出店で行うこと');
    var panels = el('div', null, 'event-phase-content'),
      names = { prepare: '準備', day: '当日', review: '振り返り' },
      icons = { prepare: 'task', day: 'events', review: 'review' };
    function select(phase) {
      tabs.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.phase === phase));
      });
      panels.querySelectorAll('[data-phase-panel]').forEach(function (p) {
        p.hidden = p.dataset.phasePanel !== phase;
      });
    }
    Object.keys(names).forEach(function (phase) {
      var b = el('button', names[phase]);
      b.type = 'button';
      b.dataset.phase = phase;
      b.dataset.icon = icons[phase];
      b.addEventListener('click', function () {
        keepControl(b, function () {
          select(phase);
        });
      });
      tabs.appendChild(b);
      var p = el('section', null, 'phase-panel');
      p.dataset.phasePanel = phase;
      p.dataset.commentKey = 'phase:' + id + ':' + phase;
      p.dataset.commentLabel =
        view.querySelector('.view-head h2').textContent + '・' + names[phase];
      p.setAttribute('aria-label', names[phase]);
      var actions = el('div', null, 'workflow-actions');
      p.appendChild(actions);
      if (phase === 'prepare') {
        actions.append(
          link('持参作品・使用ポップ', 'event.html#id=' + id, 'inventory'),
          link('準備すること', recordLink('task', id), 'task'),
          link('作品・在庫を見る', '#works', 'works'),
          link('ポップ・ブースを見る', '#market', 'booth')
        );
        p.appendChild(el('p', 'この出店の作業を確認。作品・売り場は共通の資料。', 'workflow-note'));
      }
      if (phase === 'day') {
        actions.append(
          link('売上・費用を記録', recordLink('review', id) + '&new=1', 'review'),
          link('在庫を確認・記録', recordLink('inventory', id), 'inventory')
        );
      }
      if (phase === 'review') {
        actions.append(
          link('振り返り・売上を見る', recordLink('review', id), 'review'),
          link('次にやること', recordLink('task', id), 'task')
        );
        p.appendChild(
          el(
            'p',
            '金額・振り返りはLINE認証後に表示。未分類の記録は自動で紐付けない。',
            'workflow-note'
          )
        );
      }
      panels.appendChild(p);
    });
    head.after(tabs, panels, gallery);
    if (memo) {
      var commentBox = el('details', null, 'context-comment-box');
      commentBox.appendChild(el('summary', 'この出店にコメントを書く'));
      commentBox.appendChild(memo);
      gallery.after(commentBox);
    }
    if (facts) {
      var info = el('details', null, 'event-info');
      info.appendChild(el('summary', '日時・会場・確認事項'));
      info.appendChild(facts);
      gallery.after(info);
    }
    var archive = el('details', null, 'event-source');
    archive.append(
      el('summary', '既存の準備資料'),
      el('p', '以前の記載を保管。私的な作業の進み具合とは別に確認。', 'workflow-note')
    );
    original.forEach(function (n) {
      archive.appendChild(n);
    });
    view.appendChild(archive);
    var lead = view.querySelector(':scope > .view-lead');
    if (lead) lead.hidden = true;
    select(['event-xmas', 'event-tabashita'].includes(id) ? 'prepare' : 'review');
  });
  // Past event previews stay visible without opening a disclosure.
  var events = document.getElementById('view-events'),
    past = Array.from(events.querySelectorAll(':scope > h3')).find(function (n) {
      return n.textContent === '終わったイベント';
    });
  if (past) {
    var archive = el('section', null, 'past-events');
    archive.setAttribute('aria-label', '過去の出店');
    archive.appendChild(el('h3', '過去の出店（7件）', 'subhead'));
    var next = past.nextElementSibling;
    past.replaceWith(archive);
    if (next) archive.appendChild(next);
  }
  var eventMemo = events.querySelector('[data-memo-zone]');
  if (eventMemo) {
    var disclosure = el('details', null, 'event-source');
    disclosure.appendChild(el('summary', '出店全体にコメントを書く'));
    eventMemo.before(disclosure);
    disclosure.appendChild(eventMemo);
  }
  events.querySelectorAll('.event-card .body').forEach(function (body) {
    // Public photo records have inline thumbnails; the compact legacy card's
    // supplemental disclosure must never swallow their photos.
    if (body.closest('.photo-event-record')) return;
    var heading = body.querySelector('h3'),
      actions = body.querySelector('.pop-actions'),
      date = body.querySelector('.m-line'),
      more = el('details', null, 'event-card-more');
    more.appendChild(el('summary', '会場・補足'));
    Array.from(body.children)
      .filter(function (n) {
        return n !== heading && n !== actions && !n.matches('.inline-memo');
      })
      .forEach(function (n) {
        more.appendChild(n);
      });
    if (date) heading.after(el('p', date.textContent, 'event-date'));
    if (actions) {
      var open = actions.querySelector('button');
      if (open) {
        open.textContent = '開く';
        open.setAttribute('aria-label', heading.textContent + 'を開く');
      }
    }
    body.appendChild(more);
  });
  var actions = el('div', null, 'workflow-shortcuts');
  actions.append(
    link('未分類の振り返り', 'private.html#kind=review&event=unassigned', 'review'),
    link('すべての作業', 'private.html#kind=task', 'task')
  );
  events.appendChild(actions);
  ['works', 'pops', 'booth'].forEach(function (name) {
    var view = document.getElementById('view-' + name);
    if (name === 'pops' || name === 'booth')
      view = market.querySelector('[data-market-panel=' + name + ']');
    var zone = view && view.querySelector('[data-memo-zone]');
    if (!zone) return;
    var box = el('details', null, 'context-comment-box');
    box.appendChild(
      el(
        'summary',
        { works: '作品・在庫全体', pops: 'ポップ全体', booth: 'ブース・道具' }[name] +
          'にコメントを書く'
      )
    );
    box.appendChild(zone);
    var anchor = view.querySelector('.work-filter-menu');
    if (anchor) anchor.after(box);
    else view.prepend(box);
  });
  var originalShow = window.DonguriBoard.showView;
  window.addEventListener('board-view', function (e) {
    if (e.detail.id === 'market')
      document.querySelector('[data-view-btn=market]').setAttribute('aria-controls', 'view-market');
  });
  if (window.DonguriIcons) window.DonguriIcons.decorate(document);
  // Preserve old URLs after moving the actual content into its new parent.
  var hash = location.hash.slice(1);
  if (['booth', 'pops'].includes(hash)) originalShow(hash);
  else if (hash) {
    var target = document.getElementById(hash);
    if (target && target.closest('#view-market')) originalShow('market', hash);
  }
})();
