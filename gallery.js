(function () {
  'use strict';
  // Preserve already-shared gallery links, while keeping the photos in the four-tab board.
  var legacy = document.getElementById('legacy-photo-link');
  if (legacy) {
    legacy.href =
      'index.html#' +
      (new URLSearchParams(location.search).get('category') === 'events'
        ? 'event-photo-library'
        : 'work-photo-library');
    location.replace(legacy.href);
    return;
  }
  // Scope each filter to its own public section. Never recreate comments or touch editors.
  document.querySelectorAll('[data-photo-library]').forEach(function (library) {
    var cards = Array.from(library.querySelectorAll('.board-photo-card'));
    var buttons = Array.from(library.querySelectorAll('[data-category-filter]'));
    var search = library.querySelector('[data-photo-search]');
    var group = library.querySelector('[data-photo-group]');
    var category = 'all';
    function filter() {
      var query = search.value.trim().toLocaleLowerCase();
      var count = 0;
      cards.forEach(function (card) {
        card.hidden = !(
          (category === 'all' || card.dataset.category === category) &&
          (!group || group.value === 'all' || card.dataset.group === group.value) &&
          card.dataset.search.toLocaleLowerCase().includes(query)
        );
        if (!card.hidden) count++;
      });
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category));
      });
      library.querySelector('[data-photo-count]').textContent = count + '枚';
      library.querySelector('[data-photo-empty]').hidden = count !== 0;
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        category = button.dataset.categoryFilter;
        filter();
      });
    });
    search.addEventListener('input', filter);
    if (group) group.addEventListener('change', filter);
    filter();
  });
  // Native dialog traps focus and supports Esc. Plain image links work without this API.
  var dialog = document.getElementById('photo-dialog');
  if (!dialog) return;
  var previousLink;
  document.querySelectorAll('[data-photo]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        typeof dialog.showModal !== 'function'
      )
        return;
      event.preventDefault();
      previousLink = link;
      var image = link.querySelector('img');
      document.getElementById('photo-large').src = image.src;
      document.getElementById('photo-large').alt = image.alt;
      document.getElementById('photo-label').textContent = link
        .closest('article')
        .querySelector('h4').textContent;
      dialog.showModal();
    });
  });
  document.getElementById('photo-close').addEventListener('click', function () {
    dialog.close();
  });
  dialog.addEventListener('close', function () {
    if (previousLink) previousLink.focus({ preventScroll: true });
  });
})();
