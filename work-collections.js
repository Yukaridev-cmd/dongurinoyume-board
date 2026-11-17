(function () {
  'use strict';
  var view = document.getElementById('view-works');
  if (!view) return;
  var panels = Array.from(view.querySelectorAll('[data-work-panel]'));
  var buttons = Array.from(view.querySelectorAll('[data-work-collection]'));
  var search = document.getElementById('work-search');
  var status = document.getElementById('work-collection-status');
  var selected = 'works',
    lastSelected = 'works';
  function update() {
    var q = search.value.trim().normalize('NFKC').toLocaleLowerCase(),
      total = 0;
    panels.forEach(function (panel) {
      panel.querySelectorAll('.board-photo-card').forEach(function (card) {
        card.hidden = !!q && !card.dataset.search.normalize('NFKC').toLocaleLowerCase().includes(q);
      });
      var count = panel.querySelectorAll(
        '.work:not([data-sale=excluded]):not([hidden]),.board-photo-card:not([hidden])'
      ).length;
      panel.hidden = selected === 'all' ? count === 0 : panel.dataset.workPanel !== selected;
      if (!panel.hidden) total += count;
    });
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.workCollection === selected));
    });
    status.textContent = q
      ? (selected === 'all' ? '全分類の検索結果：' : '検索結果：') +
        total +
        '件' +
        (total ? '' : '。条件を変えて探す')
      : '';
    // Hide only groups; never replace editors or clear drafts while changing the collection.
  }
  buttons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      selected = lastSelected = button.dataset.workCollection;
      update();
    });
    button.addEventListener('keydown', function (event) {
      var next =
        event.key === 'ArrowRight'
          ? (index + 1) % buttons.length
          : event.key === 'ArrowLeft'
            ? (index + buttons.length - 1) % buttons.length
            : null;
      if (next === null) return;
      event.preventDefault();
      buttons[next].click();
      buttons[next].focus({ preventScroll: true });
    });
  });
  search.addEventListener('input', function () {
    selected = search.value.trim() ? 'all' : lastSelected;
    update();
  });
  view.querySelectorAll('[data-filter]').forEach(function (button) {
    button.addEventListener('click', update);
  });
  update();
})();
