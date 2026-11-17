(function () {
  'use strict';
  // Native IME owns the value and selection. Track composition in memory only:
  // changing editor attributes from an input handler can restart Android input.
  var states = new WeakMap();
  function editor(target) {
    return (
      target &&
      target.matches &&
      target.matches('textarea,input:not([type]),input[type=text],input[type=search]')
    );
  }
  function active(target) {
    var state = states.get(target);
    return !!(state && (state.active || state.ending));
  }
  function start(event) {
    if (!editor(event.target)) return;
    var old = states.get(event.target);
    if (old && old.timer) clearTimeout(old.timer);
    states.set(event.target, { active: true, ending: false });
  }
  document.addEventListener('compositionstart', start, true);
  function observe(event) {
    if (!editor(event.target)) return;
    var state = states.get(event.target);
    if (state && state.ending) return;
    if (event.isComposing || event.inputType === 'insertCompositionText') start(event);
  }
  document.addEventListener('beforeinput', observe, true);
  document.addEventListener('input', observe, true);
  function finish(event) {
    if (!editor(event.target)) return;
    var target = event.target;
    if (event.type === 'focusout' && !states.has(target)) return;
    var state = states.get(target) || {};
    state.active = false;
    state.ending = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      if (states.get(target) === state) states.delete(target);
    }, 0);
    states.set(target, state);
  }
  document.addEventListener('compositionend', finish, true);
  document.addEventListener('focusout', finish, true);
  window.DonguriIME = {
    active: active,
    clear: function (target) {
      var state = states.get(target);
      if (state && state.timer) clearTimeout(state.timer);
      states.delete(target);
    },
  };
})();
