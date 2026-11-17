(function () {
  'use strict';
  var records = [],
    ready = false,
    kind = 'review',
    editing = null,
    generation = 0,
    catalog = [];
  var requestSelection = new Set(),
    reviewedRequestText = '';
  var currentViewer = '',
    drafts = new Map(),
    saving = false,
    pendingNew = false;
  var draftFields = [
    'eventId',
    'title',
    'date',
    'salesYen',
    'costsYen',
    'dueDate',
    'stock',
    'asset',
    'status',
    'notes',
  ];
  var form = document.getElementById('record-form'),
    fields = document.getElementById('record-fields');
  var feedback = document.getElementById('record-feedback'),
    list = document.getElementById('record-list');
  var eventFilter = document.getElementById('event-filter'),
    eventChoice = document.getElementById('record-event');
  var eventNames = {};
  Array.from(eventChoice.options).forEach(function (o) {
    if (o.value) eventNames[o.value] = o.textContent;
  });
  function addPrivateEvents(items) {
    items
      .filter((e) => !e.publicReference)
      .forEach(function (e) {
        eventNames[e.id] = e.data.title;
        [eventChoice, eventFilter].forEach(function (select) {
          var option = Array.from(select.options).find((o) => o.value === e.id);
          if (!option) {
            option = el('option');
            option.value = e.id;
            option.dataset.privateEvent = '';
            select.appendChild(option);
          }
          option.textContent = e.data.title;
        });
      });
  }
  function inScope(r) {
    return (
      eventFilter.value === 'all' ||
      (eventFilter.value === 'unassigned' ? !r.data.eventId : r.data.eventId === eventFilter.value)
    );
  }
  function scope() {
    requestSelection.clear();
    reviewedRequestText = '';
    var id = eventFilter.value,
      back = document.getElementById('event-back');
    back.hidden = !eventNames[id];
    if (eventNames[id]) {
      back.href = id.startsWith('event-') ? 'index.html#' + id : 'event.html#id=' + id;
      back.textContent = 'この出店へ戻る';
    }
    document.getElementById('request-preview').textContent = '';
    document.getElementById('request-preview').hidden = true;
    document.getElementById('export-feedback').textContent = '';
    render();
  }
  var labels = {
    review: '振り返り・売上',
    task: 'やりたいこと',
    inventory: '棚卸メモ',
    photo: '写真の確認',
    request: 'AIへの依頼',
  };
  var descriptions = {
    review: ['イベントを終えたら', '気づきと金額を記録。空欄と0円を区別。'],
    task: ['作業', '未着手・進行中・完了を二人で確認。'],
    inventory: ['数えて、確かめる', '数えた在庫を記録。更新シートへの反映は別途確認。'],
    photo: ['作品と写真を見比べる', '作品と写真を照合。写真の点数は在庫数とは別。'],
    request: ['次のボード更新へ', '変えたい内容を保存し、確認してAIへコピー。'],
  };
  var states = {
    task: ['未着手', '進行中', '完了'],
    inventory: ['未確認', '販売中', '制作中', '売切れ'],
    photo: ['要確認', '確認済み'],
    request: ['未対応', '対応中', '対応済み'],
  };
  var el = window.DonguriUI.element;
  function number(v) {
    return v === '' ? null : Number(v);
  }
  function money(v) {
    return v === null || v === undefined ? '未入力' : v.toLocaleString('ja-JP') + '円';
  }
  function setSaving(value) {
    saving = value;
    fields.disabled = !ready || saving;
    form.setAttribute('aria-busy', String(saving));
    document
      .querySelectorAll('[data-kind],.record-card button,.next-action,#new-record,#close-composer')
      .forEach(function (button) {
        button.disabled = saving;
      });
  }
  function mutationBlocked() {
    if (!saving) return false;
    feedback.textContent = '保存処理中。結果を確認してから別の記録を開く';
    return true;
  }
  function composer(open) {
    form.hidden = !open;
    document.querySelector('.records-column').hidden = open;
    document.getElementById('new-record').hidden = open;
    document.getElementById('close-composer').hidden = !open;
    document.getElementById('handoff').hidden = open || kind !== 'request';
    document.body.classList.toggle('composing', open);
  }
  function reset() {
    composer(false);
    form.reset();
    form.removeAttribute('data-private-dirty');
    editing = null;
    delete form._recordId;
    document.getElementById('form-title').textContent = '記録を追加';
    document.getElementById('record-cancel').hidden = true;
    document.getElementById('photo-preview').hidden = true;
  }
  function hasInput() {
    return (
      form.hasAttribute('data-private-dirty') ||
      editing ||
      form._recordId ||
      draftFields.some(function (key) {
        return key !== 'status' && form.elements[key].value !== '';
      })
    );
  }
  // No private records, amounts, or search terms stay visible after a lock.
  // The in-memory draft is indexed by a server-verified identity, never a display name.
  function protectDraft() {
    requestSelection.clear();
    reviewedRequestText = '';
    var dirty = Boolean(hasInput()),
      query = document.getElementById('record-search').value;
    if (currentViewer && (dirty || query)) {
      var values = {};
      draftFields.forEach(function (key) {
        values[key] = form.elements[key].value;
      });
      drafts.set(currentViewer, {
        kind: kind,
        values: values,
        id: form._recordId,
        editing: editing
          ? {
              id: editing.id,
              version: editing.version,
              data:
                editing.data && Object.prototype.hasOwnProperty.call(editing.data, 'eventId')
                  ? { eventId: editing.data.eventId }
                  : {},
            }
          : null,
        dirty: dirty,
        query: query,
        eventFilter: eventFilter.value,
        privateEvents: Object.keys(eventNames)
          .filter((id) => !id.startsWith('event-'))
          .map((id) => ({ id, data: { title: eventNames[id] } })),
        openOnly: document.getElementById('open-only').checked,
      });
    }
    ready = false;
    generation++;
    records = [];
    reset();
    setSaving(false);
    document.querySelectorAll('[data-private-event]').forEach((n) => n.remove());
    Object.keys(eventNames)
      .filter((id) => !id.startsWith('event-'))
      .forEach((id) => delete eventNames[id]);
    eventFilter.value = 'all';
    scope();
    document.getElementById('record-search').value = '';
    document.getElementById('open-only').checked = false;
    document.getElementById('copy-requests').disabled = true;
    document.getElementById('export-records').disabled = true;
    feedback.textContent = drafts.size
      ? '未保存入力をこのページ内で一時保護。同じLINEアカウントを確認後に復元'
      : '';
    document.getElementById('export-feedback').textContent = '';
    document.getElementById('request-preview').textContent = '';
    document.getElementById('request-preview').hidden = true;
    document.getElementById('preview-requests').disabled = true;
    render();
  }
  function restoreDraft() {
    var draft = drafts.get(currentViewer);
    if (!draft) return false;
    addPrivateEvents(draft.privateEvents || []);
    setKind(draft.kind);
    eventFilter.value = draft.eventFilter || 'all';
    scope();
    draftFields.forEach(function (key) {
      form.elements[key].value = draft.values[key];
    });
    editing = draft.editing;
    if (draft.id) form._recordId = draft.id;
    if (draft.dirty) form.setAttribute('data-private-dirty', '');
    document.getElementById('record-search').value = draft.query;
    document.getElementById('open-only').checked = draft.openOnly;
    document.getElementById('form-title').textContent = editing ? '記録を編集' : '記録を追加';
    document.getElementById('record-cancel').hidden = !draft.dirty;
    composer(draft.dirty);
    previewPhoto();
    drafts.delete(currentViewer);
    feedback.textContent = '未保存入力を復元。保存中に離れた場合は保存結果を確認してから再試行';
    return true;
  }
  function setKind(next) {
    if (mutationBlocked()) return false;
    if (form.hasAttribute('data-private-dirty') && !window.confirm('入力を取消して切り替える'))
      return false;
    document.getElementById('context-comment-entry').replaceChildren();
    if (window.DonguriContextComments)
      document
        .getElementById('context-comment-entry')
        .appendChild(
          window.DonguriContextComments.button('記録ページ：' + next, labels[next] + '全体')
        );
    document.getElementById('context-comments').hidden = true;
    kind = next;
    requestSelection.clear();
    reviewedRequestText = '';
    pendingNew = false;
    reset();
    document.getElementById('new-record').textContent =
      kind === 'request' ? '依頼を書く' : '記録を追加';
    feedback.textContent = '';
    document.querySelector('.inventory-tools').hidden = !['inventory', 'photo'].includes(kind);
    document.querySelectorAll('[data-kind]').forEach(function (b) {
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.kind === kind || (kind === 'photo' && b.dataset.kind === 'inventory'))
      );
    });
    document.querySelectorAll('.private-primary a').forEach(function (a) {
      var target =
        kind === 'task'
          ? 'private.html#kind=task'
          : ['inventory', 'photo'].includes(kind)
            ? 'index.html#works'
            : kind === 'review'
              ? 'index.html#events'
              : '';
      if (a.getAttribute('href') === target) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-for]').forEach(function (block) {
      block.hidden = block.dataset.for !== kind;
      block.querySelectorAll('input,select').forEach(function (input) {
        input.disabled = block.hidden;
      });
    });
    document.getElementById('section-title').textContent = labels[kind];
    document.getElementById('section-kicker').textContent = descriptions[kind][0];
    document.getElementById('section-description').textContent = descriptions[kind][1];
    document.getElementById('state-field').hidden = !states[kind];
    var select = document.getElementById('record-state');
    select.replaceChildren();
    (states[kind] || []).forEach(function (value) {
      var o = el('option', value);
      o.value = value;
      select.appendChild(o);
    });
    document.getElementById('request-hint').hidden = kind !== 'request';
    document.getElementById('notes-label').firstChild.textContent = {
      review: '振り返り・次にやること',
      task: 'やりたいことの詳細',
      inventory: '数えた条件・照合メモ',
      photo: '写真と中身の確認メモ',
      request: '変更内容・確認する根拠',
    }[kind];
    document.getElementById('open-only').checked = false;
    document.getElementById('record-sort').value = 'updated';
    document.getElementById('record-search').value = '';
    render();
    return true;
  }
  function dataFromForm() {
    var f = form.elements,
      data = { title: f.title.value.trim(), notes: f.notes.value.trim() };
    if (
      f.eventId.value ||
      (editing && editing.data && Object.prototype.hasOwnProperty.call(editing.data, 'eventId'))
    )
      data.eventId = f.eventId.value;
    if (kind === 'review')
      Object.assign(data, {
        date: f.date.value,
        salesYen: number(f.salesYen.value),
        costsYen: number(f.costsYen.value),
      });
    if (states[kind]) data.status = f.status.value;
    if (kind === 'task') data.dueDate = f.dueDate.value;
    if (kind === 'inventory') data.stock = number(f.stock.value);
    if (kind === 'photo') data.asset = f.asset.value;
    return data;
  }
  function beginEdit(record) {
    if (mutationBlocked()) return;
    if (form.hasAttribute('data-private-dirty') && !window.confirm('入力を取消して編集する'))
      return;
    reset();
    editing = record;
    Object.keys(record.data).forEach(function (key) {
      if (form.elements[key])
        form.elements[key].value = record.data[key] === null ? '' : record.data[key];
    });
    form.setAttribute('data-private-dirty', '');
    document.getElementById('form-title').textContent = '記録を編集';
    document.getElementById('record-cancel').hidden = false;
    composer(true);
    previewPhoto();
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    form.elements.title.focus();
  }
  function done(record) {
    return ['完了', '確認済み', '対応済み'].includes(record.data.status);
  }
  function renderNext() {
    var panel = document.getElementById('next-actions');
    panel.replaceChildren();
    if (!ready) {
      panel.appendChild(el('p', 'LINE認証後に、未完了の作業を表示', 'empty'));
      return;
    }
    var pending = records.filter(function (r) {
      return ['task', 'photo', 'request'].includes(r.kind) && !done(r);
    });
    pending.sort(function (a, b) {
      return (
        (a.data.dueDate || '9999').localeCompare(b.data.dueDate || '9999') ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    });
    if (!pending.length) {
      panel.appendChild(
        el('p', 'いま残っている作業はなし。思いついたことを「やりたいこと」へ。', 'empty')
      );
      return;
    }
    pending.slice(0, 3).forEach(function (r) {
      var b = el('button', undefined, 'next-action');
      b.type = 'button';
      b.disabled = saving;
      b.append(
        el('span', labels[r.kind] + (r.data.dueDate ? ' ・ ' + r.data.dueDate : ''), 'eyebrow'),
        el('strong', r.data.title),
        el('span', r.data.status + ' →', 'next-state')
      );
      b.addEventListener('click', function () {
        if (setKind(r.kind)) {
          if (r.canEdit) beginEdit(r);
          else {
            document.getElementById('record-search').value = r.data.title;
            render();
            document.getElementById('workspace').scrollIntoView({ block: 'start' });
          }
        }
      });
      panel.appendChild(b);
    });
  }
  // Sum only explicitly linked saved records. Unknown amounts stay unknown;
  // daily/monthly overlaps and missing cash sales cannot be inferred here.
  function renderEventTotals() {
    var panel = document.getElementById('event-totals');
    panel.replaceChildren();
    panel.hidden = !ready || kind !== 'review';
    if (panel.hidden) return;
    panel.append(
      el('h3', '出店別の合計'),
      el('p', '入力済みの金額を合計。現金の未記録・日次と月次の重複は自動補正しない。', 'hint')
    );
    var reviews = records.filter(function (r) {
        return r.kind === 'review';
      }),
      groups = new Map();
    reviews.forEach(function (r) {
      var key = r.data.eventId || 'unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    if (!reviews.length) {
      panel.appendChild(
        el('p', '記録の「関連する出店」を選んで保存すると、ここに合計を表示。', 'hint')
      );
      return;
    }
    var grid = el('div', undefined, 'event-total-grid');
    groups.forEach(function (rows, id) {
      if (eventFilter.value !== 'all' && eventFilter.value !== id) return;
      var card = el('article', undefined, 'event-total-card');
      card.appendChild(el('h4', eventNames[id] || '未分類'));
      ['salesYen', 'costsYen'].forEach(function (field) {
        var entered = rows.filter(function (r) {
            return Number.isSafeInteger(r.data[field]);
          }),
          sum = entered.reduce(function (total, r) {
            return total + BigInt(r.data[field]);
          }, 0n);
        card.appendChild(
          el(
            'p',
            (field === 'salesYen' ? '売上 ' : '費用 ') +
              (entered.length ? sum.toLocaleString('ja-JP') + '円' : '未入力')
          )
        );
        card.appendChild(
          el(
            'span',
            '入力済み ' + entered.length + '件 / 未入力 ' + (rows.length - entered.length) + '件',
            'hint'
          )
        );
      });
      var action = el('button', id === 'unassigned' ? '未分類を紐付ける' : 'この出店の記録');
      action.type = 'button';
      action.addEventListener('click', function () {
        if (mutationBlocked()) return;
        eventFilter.value = id;
        scope();
      });
      card.appendChild(action);
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    if (groups.has('unassigned'))
      panel.appendChild(
        el(
          'p',
          '未分類は別集計。各記録の「編集」から出店を選んで保存。自動では紐付けない。',
          'hint'
        )
      );
  }
  function render() {
    renderNext();
    renderEventTotals();
    document.getElementById('visible-count').textContent = '';
    ['review', 'task', 'waiting'].forEach(function (key) {
      var node = document.getElementById(key + '-count');
      if (!ready) {
        node.textContent = '—';
        return;
      }
      node.textContent =
        key === 'review'
          ? records.filter(function (r) {
              return r.kind === 'review';
            }).length
          : key === 'task'
            ? records.filter(function (r) {
                return r.kind === 'task' && !done(r);
              }).length
            : records.filter(function (r) {
                return (r.kind === 'request' || r.kind === 'photo') && !done(r);
              }).length;
    });
    list.replaceChildren();
    reviewedRequestText = '';
    document.getElementById('request-preview').hidden = true;
    var hasKind =
      ready &&
      records.some(function (r) {
        return r.kind === kind;
      });
    document.querySelector('.event-scope').hidden = !hasKind && eventFilter.value === 'all';
    document.querySelector('.list-tools').hidden = !hasKind;
    document.querySelector('.list-order').hidden = !hasKind;
    if (!ready) {
      list.appendChild(el('p', 'LINE認証後に記録を表示', 'empty'));
      return;
    }
    var query = document.getElementById('record-search').value.trim().toLocaleLowerCase();
    var rows = records
      .filter(function (r) {
        return (
          r.kind === kind &&
          inScope(r) &&
          (!document.getElementById('open-only').checked || !done(r)) &&
          (!query ||
            (r.data.title + ' ' + r.data.notes + ' ' + r.author)
              .toLocaleLowerCase()
              .includes(query))
        );
      })
      .sort(function (a, b) {
        return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
      });
    var order = document.getElementById('record-sort').value;
    if (order === 'title')
      rows.sort(function (a, b) {
        return a.data.title.localeCompare(b.data.title, 'ja');
      });
    if (order === 'due')
      rows.sort(function (a, b) {
        return (a.data.dueDate || a.data.date || '9999').localeCompare(
          b.data.dueDate || b.data.date || '9999'
        );
      });
    document.getElementById('visible-count').textContent = rows.length + '件を表示';
    if (!rows.length) {
      list.appendChild(
        el(
          'p',
          query || document.getElementById('open-only').checked
            ? '条件に合う記録なし。検索や未完了の条件を変更'
            : '記録はまだなし。「追加」から記入',
          'empty'
        )
      );
      return;
    }
    rows.forEach(function (record) {
      var card = el('article', undefined, 'record-card'),
        meta = el('div', undefined, 'record-meta');
      meta.append(
        el('span', record.author),
        el('time', new Date(record.updatedAt).toLocaleString('ja-JP'))
      );
      if (record.data.status) meta.appendChild(el('span', record.data.status, 'badge'));
      card.append(meta, el('h3', record.data.title));
      if (record.kind === 'request' && record.data.status === '未対応') {
        var pickLabel = el('label', undefined, 'request-pick'),
          pick = el('input');
        pick.type = 'checkbox';
        pick.checked = requestSelection.has(record.id);
        pick.dataset.requestPick = record.id;
        pick.addEventListener('change', function () {
          if (pick.checked) requestSelection.add(record.id);
          else requestSelection.delete(record.id);
          reviewedRequestText = '';
          document.getElementById('request-preview').hidden = true;
          document.getElementById('export-feedback').textContent =
            requestSelection.size + '件を選択。内容を確認してからコピー';
        });
        pickLabel.append(pick, el('span', 'AIに渡す'));
        card.appendChild(pickLabel);
      }
      card.appendChild(el('p', eventNames[record.data.eventId] || '未分類', 'record-event-label'));
      if (record.kind === 'review') {
        var nums = el('div', undefined, 'record-numbers');
        nums.append(
          el('span', '売上 ' + money(record.data.salesYen)),
          el('span', '費用 ' + money(record.data.costsYen))
        );
        card.appendChild(nums);
        if (record.data.date) card.appendChild(el('p', record.data.date, 'hint'));
      }
      if (record.kind === 'inventory')
        card.append(
          el(
            'div',
            '在庫 ' + (record.data.stock === null ? '未入力' : record.data.stock + '点'),
            'record-numbers'
          ),
          el('p', '棚卸メモ・更新シート未反映', 'hint')
        );
      if (record.kind === 'task' && record.data.dueDate)
        card.appendChild(el('p', '期限 ' + record.data.dueDate, 'hint'));
      if (record.kind === 'photo' && /^assets\/[a-z0-9-]+\.jpg$/.test(record.data.asset)) {
        var img = el('img');
        img.src = record.data.asset;
        img.alt = record.data.title + 'の照合用写真';
        img.loading = 'lazy';
        card.appendChild(img);
      }
      if (record.data.notes.length > 140) {
        var fullText = el('details', undefined, 'record-full-text');
        fullText.append(
          el('summary', record.data.notes.slice(0, 70) + '… 本文を開く'),
          el('div', record.data.notes, 'record-text')
        );
        card.appendChild(fullText);
      } else card.appendChild(el('div', record.data.notes, 'record-text'));
      if (record.version > 1)
        card.appendChild(
          el('p', '最終更新 ' + record.updatedBy + '・版 ' + record.version, 'hint')
        );
      var actions = el('div', undefined, 'actions');
      if (record.canEdit) {
        var edit = el('button', '編集');
        edit.type = 'button';
        edit.addEventListener('click', function () {
          beginEdit(record);
        });
        var del = el('button', '消す');
        del.type = 'button';
        del.addEventListener('click', async function () {
          if (!ready || mutationBlocked() || !window.confirm('この記録を一覧から消す')) return;
          var epoch = generation;
          setSaving(true);
          feedback.textContent = '削除処理中';
          try {
            await window.DonguriComments.save('/records/' + record.id, 'DELETE', {
              version: record.version,
            });
            if (epoch !== generation || !ready) return;
            records = records.filter(function (r) {
              return r.id !== record.id;
            });
            if (editing && editing.id === record.id) reset();
            render();
            feedback.textContent = '記録を一覧から削除済み';
          } catch (error) {
            if (epoch === generation) feedback.textContent = error.message;
          } finally {
            if (epoch === generation) setSaving(false);
          }
        });
        actions.append(edit, del);
        if (record.kind === 'review') {
          var associate = el('button', record.data.eventId ? '出店を変更' : '出店を紐付け');
          associate.type = 'button';
          associate.addEventListener('click', function () {
            beginEdit(record);
            if (editing === record) eventChoice.focus();
          });
          actions.appendChild(associate);
        }
        if (record.kind === 'task' && !done(record)) {
          var finish = el('button', '完了にする');
          finish.type = 'button';
          finish.addEventListener('click', async function () {
            if (!ready || mutationBlocked()) return;
            var epoch = generation;
            setSaving(true);
            feedback.textContent = '保存中';
            try {
              var result = await window.DonguriComments.save('/records/' + record.id, 'PATCH', {
                version: record.version,
                data: Object.assign({}, record.data, { status: '完了' }),
              });
              if (epoch !== generation || !ready) return;
              records = records.map(function (r) {
                return r.id === result.record.id ? result.record : r;
              });
              render();
              feedback.textContent = '完了として保存済み';
            } catch (error) {
              if (epoch === generation) feedback.textContent = error.message;
            } finally {
              if (epoch === generation) setSaving(false);
            }
          });
          actions.prepend(finish);
        }
      }
      if (window.DonguriContextComments)
        actions.appendChild(
          window.DonguriContextComments.button(
            '記録：' + record.id,
            labels[record.kind] + '「' + record.data.title + '」',
            record.data.eventId
          )
        );
      if (record.kind !== 'request') {
        var request = el('button', 'この記録からAIへの依頼');
        request.type = 'button';
        request.addEventListener('click', function () {
          if (!setKind('request')) return;
          form.elements.eventId.value = record.data.eventId || '';
          form.elements.title.value = record.data.title + 'の更新';
          form.elements.notes.value =
            '対象：' +
            labels[record.kind] +
            '「' +
            record.data.title +
            '」\n変更したいこと：\n確認した根拠：';
          markDirty();
          composer(true);
          form.scrollIntoView({ block: 'start', behavior: 'smooth' });
          form.elements.title.focus();
        });
        actions.appendChild(request);
      }
      actions.querySelectorAll('button').forEach(function (button) {
        button.disabled = saving;
      });
      card.appendChild(actions);
      list.appendChild(card);
    });
  }
  // Fetch all pages before replacing the list. The generation prevents a late
  // response from an old identity from rendering into a new session.
  async function load() {
    var epoch = ++generation,
      rows = [],
      cursor = '';
    fields.disabled = true;
    try {
      do {
        var data = await window.DonguriComments.save(
          '/records' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
          'GET'
        );
        rows = rows.concat(data.records);
        cursor = data.next;
      } while (cursor);
      if (epoch !== generation || !ready) return;
      var eventRows = [],
        eventCursor = '';
      do {
        var eventData = await window.DonguriComments.save(
          '/events' + (eventCursor ? '?cursor=' + encodeURIComponent(eventCursor) : ''),
          'GET'
        );
        eventRows = eventRows.concat(eventData.events || []);
        eventCursor = eventData.next;
      } while (eventCursor);
      if (epoch !== generation || !ready) return;
      addPrivateEvents(eventRows);
      if (initialEvent && eventNames[initialEvent]) {
        eventFilter.value = initialEvent;
        if (
          initialParams.get('new') === '1' &&
          !form.hasAttribute('data-private-dirty') &&
          !editing &&
          !form.hidden
        )
          form.elements.eventId.value = initialEvent;
        initialEvent = null;
        scope();
      }
      records = rows;
      render();
      if (!hasInput()) feedback.textContent = '';
    } catch (error) {
      if (epoch === generation) feedback.textContent = error.message;
    } finally {
      if (epoch === generation) fields.disabled = !ready || saving;
    }
  }
  function markDirty() {
    form.setAttribute('data-private-dirty', '');
    document.getElementById('record-cancel').hidden = false;
  }
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!ready || fields.disabled) return;
    var epoch = generation,
      body = { data: dataFromForm() };
    var wasEditing = editing;
    if (wasEditing) body.version = wasEditing.version;
    else {
      if (!form._recordId) form._recordId = window.DonguriUI.newId();
      body.id = form._recordId;
      body.kind = kind;
    }
    setSaving(true);
    feedback.textContent = '保存中';
    try {
      var result = await window.DonguriComments.save(
        wasEditing ? '/records/' + wasEditing.id : '/records',
        wasEditing ? 'PATCH' : 'POST',
        body
      );
      if (epoch !== generation || !ready) return;
      records = records.filter(function (r) {
        return r.id !== result.record.id;
      });
      records.push(result.record);
      drafts.delete(currentViewer);
      reset();
      render();
      feedback.textContent = '記録保存済み';
    } catch (error) {
      if (epoch === generation) feedback.textContent = error.message;
    } finally {
      if (epoch === generation) setSaving(false);
    }
  });
  document.querySelectorAll('[data-kind]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (kind !== button.dataset.kind) setKind(button.dataset.kind);
    });
  });
  document.getElementById('record-cancel').addEventListener('click', function () {
    if (mutationBlocked()) return;
    drafts.delete(currentViewer);
    reset();
    feedback.textContent = '';
  });
  eventFilter.addEventListener('change', scope);
  document.getElementById('record-search').addEventListener('input', render);
  document.getElementById('open-only').addEventListener('change', render);
  document.getElementById('record-sort').addEventListener('change', render);
  document.getElementById('close-composer').addEventListener('click', function () {
    if (mutationBlocked()) return;
    if (hasInput() && !window.confirm('入力を取消して一覧に戻る')) return;
    drafts.delete(currentViewer);
    reset();
    feedback.textContent = '';
    document.getElementById('new-record').focus();
  });
  document.getElementById('new-record').addEventListener('click', function () {
    if (mutationBlocked()) return;
    pendingNew = false;
    if (hasInput() && !window.confirm('入力を取消して新しく書く')) return;
    reset();
    if (eventNames[eventFilter.value]) form.elements.eventId.value = eventFilter.value;
    composer(true);
    feedback.textContent = '';
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (ready) form.elements.title.focus();
    else form.focus();
  });
  function selectedRequestText() {
    var selected = records.filter(function (r) {
      return (
        r.kind === 'request' &&
        inScope(r) &&
        r.data.status === '未対応' &&
        requestSelection.has(r.id)
      );
    });
    return selected.length
      ? [
          'どんぐりの夢 更新依頼',
          '公開前に金額・個人的な記録・コメントを除き、更新シートと根拠を確認する。',
        ]
          .concat(
            selected.map(function (r) {
              return '■ ' + r.data.title + '\n' + r.author + '：' + r.data.notes;
            })
          )
          .join('\n\n')
      : '';
  }
  document.getElementById('preview-requests').addEventListener('click', function () {
    if (!ready) return;
    var preview = document.getElementById('request-preview');
    reviewedRequestText = selectedRequestText();
    preview.textContent = reviewedRequestText || '下の依頼からAIに渡すものを選択';
    preview.hidden = false;
  });
  function previewPhoto() {
    var path = form.elements.asset.value,
      img = document.getElementById('photo-preview');
    img.hidden = !path;
    if (path) img.src = path;
  }
  document.getElementById('photo-asset').addEventListener('change', previewPhoto);
  window.addEventListener('comments-auth', function (event) {
    var next = event.detail.viewer;
    if (event.detail.ready && !/^[0-9a-f]{64}$/.test(next || '')) {
      protectDraft();
      feedback.textContent = '共有処理の本人確認が必要。未保存入力は保護';
      return;
    }
    if (!event.detail.ready && ready) protectDraft();
    if (event.detail.ready && currentViewer && next !== currentViewer) protectDraft();
    ready = event.detail.ready;
    if (ready) {
      currentViewer = next;
      var restored = restoreDraft();
      if (pendingNew && !restored) document.getElementById('new-record').click();
    }
    fields.disabled = !ready;
    document.getElementById('preview-requests').disabled = !ready;
    document.getElementById('copy-requests').disabled = !ready;
    document.getElementById('export-records').disabled = !ready;
    if (ready) load();
    render();
  });
  window.addEventListener('open-ai-requests', function () {
    if (setKind('request')) {
      load();
      document.getElementById('handoff').scrollIntoView({ block: 'start' });
    }
  });
  window.addEventListener('comments-clear', protectDraft);
  window.addEventListener('comments-suspend', protectDraft);
  window.addEventListener('beforeunload', function (event) {
    if (
      hasInput() ||
      Array.from(drafts.values()).some(function (draft) {
        return draft.dirty;
      })
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.getElementById('copy-requests').addEventListener('click', async function () {
    var output = document.getElementById('export-feedback');
    if (!ready) return;
    var text = selectedRequestText();
    if (!text) {
      output.textContent = '下の依頼からAIに渡すものを選択';
      return;
    }
    if (text !== reviewedRequestText) {
      output.textContent = '先に「送る内容を確認」を押す';
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      output.textContent = 'コピー済み。送る内容と送信先を自分で確認';
    } catch {
      output.textContent = 'コピーできず。依頼欄の本文を選択してコピー';
    }
  });
  document.getElementById('export-records').addEventListener('click', function () {
    if (!ready) return;
    var blob = new Blob(
      [
        JSON.stringify(
          { format: 'donguri-private-v1', exportedAt: new Date().toISOString(), records: records },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    var url = URL.createObjectURL(blob),
      a = el('a');
    a.href = url;
    a.download = 'donguri-private-records.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    document.getElementById('export-feedback').textContent =
      '金額・個人的な記録を含むファイル。公開場所へ置かず手元で保管';
  });
  fetch('catalog.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw Error();
      return response.json();
    })
    .then(function (data) {
      catalog = data;
      var incoming;
      try {
        incoming = decodeURIComponent(location.hash.replace(/^#inventory=/, ''));
      } catch {}
      if (
        location.hash.startsWith('#inventory=') &&
        catalog.some(function (item) {
          return item.title === incoming;
        }) &&
        !hasInput()
      ) {
        setKind('inventory');
        form.elements.title.value = incoming;
        markDirty();
        composer(true);
      }
      catalog.forEach(function (item) {
        var o = el('option');
        o.value = item.title;
        document.getElementById('product-names').appendChild(o);
        item.photos
          .filter(function (photo) {
            return photo.display !== 'hidden';
          })
          .forEach(function (photo) {
            var option = el('option', item.title + ' — ' + photo.label);
            option.value = photo.src;
            document.getElementById('photo-asset').appendChild(option);
          });
      });
    })
    .catch(function () {
      document.getElementById('private-notice').textContent =
        '作品候補を読み込めず。名称は手入力し、更新シートと照合';
    });
  var initialParams = new URLSearchParams(location.hash.slice(1)),
    initialKind = initialParams.get('kind'),
    initialEvent = initialParams.get('event');
  if (initialEvent === 'unassigned' || eventNames[initialEvent]) eventFilter.value = initialEvent;
  setKind(Object.prototype.hasOwnProperty.call(labels, initialKind) ? initialKind : 'review');
  scope();
  pendingNew = initialParams.get('new') === '1';
})();
