(function () {
  'use strict';
  // Original 24px line drawings. No image/font service, tracking or external requests.
  var drawings = {
    home: ['M3 11 12 3l9 8', 'M5 10v11h5v-7h4v7h5V10'],
    archive: ['M3 4h18v4H3zM5 8v13h14V8', 'M9 12h6'],
    review: ['M6 3h12v18H6z', 'M9 7h6M9 11h6M9 16h2M14 14v4'],
    task: ['M9 5h11M9 12h11M9 19h11', 'm3 5 1 1 2-3m-3 9 1 1 2-3m-3 9 1 1 2-3'],
    inventory: ['m3 7 9-4 9 4v12l-9 3-9-3z', 'm3 7 9 4 9-4M12 11v11M7 5l10 4v5'],
    photo: ['M3 5h18v15H3z', 'm4 18 5-6 4 4 3-3 4 5', 'M15 9h.01'],
    request: ['M6 3h9l4 4v6M6 3v18h7M15 3v5h4', 'M9 11h5M9 15h3', 'M15 18h7m-3-3 3 3-3 3'],
    comment: ['M4 4h16v12H9l-5 4z', 'M8 8h8M8 12h5'],
    events: ['M4 5h16v16H4zM4 9h16M8 3v4M16 3v4', 'M8 13h2M14 13h2M8 17h2'],
    works: ['M4 8h16v13H4z', 'M8 8V6a4 4 0 0 1 8 0v2', 'M8 12v1M16 12v1'],
    gift: ['M3 9h18v4H3zM5 13v8h14v-8M12 9v12', 'M12 9C3 9 5 1 9 4l3 5c9 0 7-8 3-5z'],
    booth: ['M3 10h18l-2-6H5z', 'M5 10v11M19 10v11M3 21h18M8 14h8v7'],
    pops: ['M5 3h14v15H5zM9 18l-2 4M15 18l2 4', 'M8 7h8M8 11h5M8 14h8'],
    share: ['M6 5h12v11H6z', 'M9 8h6M9 12h3', 'M15 19H3m3-3-3 3 3 3'],
    add: ['M12 4v16M4 12h16'],
    refresh: ['M20 8a8 8 0 0 0-14-3L3 8', 'M3 3v5h5', 'M4 16a8 8 0 0 0 14 3l3-3', 'M21 21v-5h-5'],
    copy: ['M8 8h12v13H8z', 'M16 8V3H3v13h5'],
    save: ['M4 3h13l3 3v15H4z', 'M8 3v6h8V3M8 21v-8h8v8'],
    check: ['m4 12 5 5L20 6'],
    edit: ['m5 15 10-10 4 4L9 19l-5 1z', 'm13 7 4 4'],
    inspect: ['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'm15 15 6 6'],
  };
  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('ui-icon');
    drawings[name].forEach(function (d) {
      var p = document.createElementNS(svg.namespaceURI, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }
  function decorate(root) {
    root.querySelectorAll('[data-icon],[data-view-btn],[data-kind]').forEach(function (node) {
      var name = node.dataset.icon || node.dataset.viewBtn || node.dataset.kind;
      if (!drawings[name] || node.querySelector('.ui-icon')) return;
      node.prepend(icon(name));
      node.classList.add('with-icon');
    });
  }
  window.DonguriIcons = { decorate: decorate };
  decorate(document);
})();
