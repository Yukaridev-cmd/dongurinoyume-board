import publicEvents from '../events.json' with { type: 'json' };
import products from '../catalog.json' with { type: 'json' };
import pops from '../pops.json' with { type: 'json' };
export function eventsApi({ HttpError, UUID, readBody, field }) {
  const known = (id) => publicEvents.find((e) => e.id === id);
  const valid = (id) => UUID.test(id) || known(id);
  function optional(v, max) {
    return v === undefined || v === '' ? '' : field(v, max);
  }
  function selection(value, catalog) {
    if (
      !Array.isArray(value) ||
      value.length > catalog.length ||
      new Set(value).size !== value.length ||
      value.some((id) => typeof id !== 'string' || !catalog.some((item) => item.id === id))
    )
      throw new HttpError(400, '登録済みの作品・ポップを選択');
    return [...value].sort();
  }
  function validate(id, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new HttpError(400, '入力を確認');
    const data = {
      title: known(id)?.title || field(input.title, 160),
      date: optional(input.date, 10),
      start: optional(input.start, 5),
      end: optional(input.end, 5),
      venue: optional(input.venue, 300),
      notes: optional(input.notes, 4000),
      products: selection(input.products, products),
      pops: selection(input.pops, pops),
    };
    if (
      data.date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
        !Number.isFinite(Date.parse(data.date)) ||
        new Date(data.date).toISOString().slice(0, 10) !== data.date)
    )
      throw new HttpError(400, '日付を確認');
    for (const time of [data.start, data.end])
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, '時刻を確認');
    if (data.start && data.end && data.start >= data.end)
      throw new HttpError(400, '終了時刻は開始時刻より後を指定');
    // Public source metadata is not overwritten by a private preparation plan.
    if (known(id)) Object.assign(data, { date: '', start: '', end: '', venue: '' });
    return data;
  }
  function present(row, members) {
    return {
      id: row.id,
      data: JSON.parse(row.data),
      version: row.version,
      updatedAt: row.updated_at,
      updatedBy: members[row.updated_by] || '共有メンバー',
      publicReference: !!known(row.id),
    };
  }
  return async function (request, url, env, user, members, json) {
    if (url.pathname === '/events' && request.method === 'GET') {
      const cursor = url.searchParams.get('cursor') || '';
      if (cursor && !valid(cursor)) throw new HttpError(400, '取得位置を確認');
      const result = await env.DB.prepare(
          'SELECT * FROM event_plans WHERE id > ? ORDER BY id LIMIT 101'
        )
          .bind(cursor)
          .all(),
        rows = result.results.slice(0, 100);
      return json({
        events: rows.map((r) => present(r, members)),
        next: result.results.length > 100 ? rows.at(-1).id : null,
      });
    }
    const id = url.pathname.slice('/events/'.length);
    if (!url.pathname.startsWith('/events/') || !valid(id)) throw new HttpError(400, '出店を確認');
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM event_plans WHERE id = ?').bind(id).first();
      if (!row) throw new HttpError(404, '保存済みの準備なし');
      return json({ event: present(row, members) });
    }
    if (request.method !== 'POST') throw new HttpError(405, '操作対象を確認');
    const body = await readBody(request);
    if (!Number.isSafeInteger(body.version) || body.version < 0)
      throw new HttpError(400, '更新番号を確認');
    const data = JSON.stringify(validate(id, body.data)),
      now = new Date().toISOString();
    if (body.version === 0) {
      await env.DB.prepare(
        'INSERT INTO event_plans(id,data,owner,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING'
      )
        .bind(id, data, user.id, user.id, now, now)
        .run();
      const row = await env.DB.prepare('SELECT * FROM event_plans WHERE id = ?').bind(id).first();
      if (row.owner !== user.id || row.data !== data || row.version !== 1)
        throw new HttpError(409, '別の画面で保存済み。再読込して確認');
      return json({ event: present(row, members) }, 201);
    }
    const changed = await env.DB.prepare(
      'UPDATE event_plans SET data=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?'
    )
      .bind(data, user.id, now, id, body.version)
      .run();
    const row = await env.DB.prepare('SELECT * FROM event_plans WHERE id = ?').bind(id).first();
    if (
      changed.meta.changes !== 1 &&
      !(row && row.version === body.version + 1 && row.updated_by === user.id && row.data === data)
    )
      throw new HttpError(409, '別の画面で変更済み。入力を控えて再読込');
    return json({ event: present(row, members) });
  };
}
