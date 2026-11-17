(function () {
  'use strict';
  // Shared presentation helpers. This module performs no requests or storage.
  function element(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  // Do not reapply editing attributes when their state has not changed: Android
  // keyboards own the input connection while native composition is in progress.
  function setDisabled(control, disabled) {
    if (control.disabled !== disabled) control.disabled = disabled;
  }
  // Both paths create RFC 4122 version 4 IDs. Never use Math.random for saved IDs.
  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    return (
      hex.slice(0, 8) +
      '-' +
      hex.slice(8, 12) +
      '-' +
      hex.slice(12, 16) +
      '-' +
      hex.slice(16, 20) +
      '-' +
      hex.slice(20)
    );
  }
  window.DonguriUI = Object.freeze({ element: element, setDisabled: setDisabled, newId: newId });
})();
