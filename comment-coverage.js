(function () {
  'use strict';
  var api = window.DonguriBoardComments;
  if (!api) throw new Error('共通コメント部品を先に読み込む');
  var slots = new WeakMap();
  function marked(root) {
    return (root.matches && root.matches('[data-comment-key]') ? [root] : []).concat(
      Array.from(root.querySelectorAll('[data-comment-key]'))
    );
  }
  // Each content owner receives its own editor. Never count a nested photo's
  // editor as coverage for an album, phase, resource group, or the whole page.
  function mount(root) {
    marked(root || document).forEach(function (owner) {
      if (slots.has(owner)) return;
      var slot = document.createElement('div');
      slot.className = 'comment-corner-slot';
      slot.dataset.cornerOwner = owner.dataset.commentKey;
      if (/^H[1-6]$/.test(owner.tagName)) owner.after(slot);
      else owner.appendChild(slot);
      api.register(slot, owner.dataset.commentKey, owner.dataset.commentLabel || 'このコーナー');
      slots.set(owner, slot);
    });
    api.refresh();
  }
  function audit() {
    var required = Array.from(
      document.querySelectorAll(
        '.work,.pop-entry,.event-card,.board-photo-card,[data-photo-library],figure,.idea,.task,.checklist li,.resource-group,.work-reference,#reference-works,.board-reference,#comment-summary,[data-phase-panel]'
      )
    );
    var uncovered = required.filter(function (owner) {
      if (owner.hasAttribute('data-comment-key'))
        return !slots.get(owner)?.querySelector('[data-inline-memo]');
      if (owner.matches('.work,.pop-entry,.event-card'))
        return !owner.querySelector('.inline-memo [data-inline-memo]');
      return true;
    });
    // Page-level comments are additional to the individual items. Retired empty
    // source views are skipped after workflow.js moves their contents.
    document.querySelectorAll('.view').forEach(function (view) {
      if (!view.querySelector('.view-head h2')) return;
      if (!view.querySelector('[data-memo-zone],:scope > .comment-corner-slot'))
        uncovered.push(view);
    });
    return {
      required: required.length,
      registered: document.querySelectorAll('[data-corner-owner]').length,
      uncovered: uncovered.map(function (n) {
        return n.id || n.dataset.commentKey || n.className;
      }),
    };
  }
  window.DonguriCommentCoverage = { mount: mount, audit: audit };
  mount(document);
})();
