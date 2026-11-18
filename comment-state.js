(function () {
  'use strict';
  // Only API-returned state controls ordering. No localStorage, hidden text marker,
  // guessed completion or automatic removal of the original comment.
  var el = window.DonguriUI.element;
  function append(list, rows, render) {
    var sorted = rows.slice().sort(function (a, b) {
      return (b.stamp || '').localeCompare(a.stamp || '') || b.id.localeCompare(a.id);
    });
    sorted
      .filter(function (c) {
        return !c.resolved;
      })
      .forEach(function (c) {
        list.appendChild(render(c));
      });
    var done = sorted.filter(function (c) {
      return c.resolved === true;
    });
    if (done.length) {
      var archive = el('details', '', 'comments-completed');
      archive.appendChild(el('summary', '対応済み（' + done.length + '件）'));
      done.forEach(function (c) {
        archive.appendChild(render(c));
      });
      list.appendChild(archive);
    }
  }
  function button(comment, update, report, canChange) {
    var b = el(
      'button',
      comment.resolved ? '未対応へ戻す' : '対応済みにする',
      'comment-state-button'
    );
    b.type = 'button';
    // Completion is an explicit, reversible decision after verification. Never
    // infer it from comment wording, age, another comment or a generated draft.
    b.title = comment.resolved
      ? '本文を残したまま未対応へ戻す'
      : '対応と確認が完了したコメントだけを、下の対応済みへ退避する';
    b.dataset.commentState = comment.id;
    b.addEventListener('click', async function () {
      if (canChange && !canChange()) return;
      b.disabled = true;
      try {
        var result = await window.DonguriComments.save('/comments/' + comment.id, 'PATCH', {
          version: comment.version,
          resolved: !comment.resolved,
        });
        update(result.comment);
        report(result.comment.resolved ? '対応済みに移動。本文はそのまま保存' : '未対応に戻した');
      } catch (error) {
        report(error.message);
      } finally {
        b.disabled = false;
      }
    });
    return b;
  }
  window.DonguriCommentState = { append: append, button: button };
})();
