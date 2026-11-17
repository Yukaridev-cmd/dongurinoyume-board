(function () {
  'use strict';
  // This gallery reads public DOM only. It never loads comments or changes inventory.
  var cards = Array.from(document.querySelectorAll('.photo-card'));
  var buttons = Array.from(document.querySelectorAll('[data-category-filter]'));
  var search = document.getElementById('photo-search');
  var category = new URLSearchParams(location.search).get('category') || 'all';
  if (
    !buttons.some(function (button) {
      return button.dataset.categoryFilter === category;
    })
  )
    category = 'all';
  var back = document.getElementById('gallery-back');
  back.href = 'index.html#' + (category === 'events' ? 'events' : 'works');
  function filter() {
    var query = search.value.trim().toLocaleLowerCase();
    var count = 0;
    cards.forEach(function (card) {
      card.hidden = !(
        (category === 'all' || card.dataset.category === category) &&
        card.dataset.search.toLocaleLowerCase().includes(query)
      );
      if (!card.hidden) count++;
    });
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category));
    });
    document.getElementById('photo-count').textContent = count + '枚';
    document.getElementById('photo-empty').hidden = count !== 0;
  }
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      category = button.dataset.categoryFilter;
      filter();
    });
  });
  search.addEventListener('input', filter);
  filter();

  // Native dialog provides focus trapping and Esc support; the image link is the fallback.
  var dialog = document.getElementById('photo-dialog');
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
        .querySelector('h2').textContent;
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
