import events from '../events.json' with { type: 'json' };
const kinds = ['review', 'task', 'inventory', 'photo', 'request'];
const states = {
  task: ['未着手', '進行中', '完了'],
  inventory: ['未確認', '販売中', '制作中', '売切れ'],
  photo: ['要確認', '確認済み'],
  request: ['未対応', '対応中', '対応済み'],
};
export function recordsApi({ HttpError, UUID, readBody, field }) {
  function optional(value, max) {
    return value == null || value === '' ? '' : field(value, max);
  }
  function number(value, max) {
    if (value === null || value === undefined || value === '') return null;
    if (!Number.isSafeInteger(value) || value < 0 || value > max)
      throw new HttpError(400, '数量・金額は0以上の整数で記入');
    return value;
  }
  function date(value) {
    if (value == null || value === '') return '';
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new HttpError(400, '日付を確認');
    return value;
  }
  function validate(kind, input) {
    if (!kinds.includes(kind) || !input || Array.isArray(input) || typeof input !== 'object')
      throw new HttpError(400, '記録の種類を確認');
    const data = { title: field(input.title, 160), notes: optional(input.notes, 4000) };
    // Missing legacy fields remain absent. No inferred association or migration.
    if (Object.hasOwn(input, 'eventId')) {
      if (
        typeof input.eventId !== 'string' ||
        (input.eventId !== '' &&
          !UUID.test(input.eventId) &&
          !events.some((event) => event.id === input.eventId))
      )
        throw new HttpError(400, '登録済みの出店を選択');
      data.eventId = input.eventId;
    }
    if (kind === 'review')
      Object.assign(data, {
        date: date(input.date),
        salesYen: number(input.salesYen, 100000000),
        costsYen: number(input.costsYen, 100000000),
      });
    if (states[kind]) {
      if (!states[kind].includes(input.status)) throw new HttpError(400, '状態を確認');
      data.status = input.status;
    }
    if (kind === 'task') data.dueDate = date(input.dueDate);
    if (kind === 'inventory') {
      data.stock = number(input.stock, 1000000);
      // This is a count awaiting reconciliation, never an automatic overwrite of the source Sheet.
      data.source = '棚卸メモ・更新シート未反映';
    }
    if (kind === 'photo') {
      data.asset = optional(input.asset, 160);
      if (data.asset && !/^assets\/[a-z0-9-]+\.jpg$/.test(data.asset))
        throw new HttpError(400, '既存の写真を選択');
    }
    return data;
  }
  async function checkEvent(data, env) {
    if (data && UUID.test(data.eventId || '')) {
      const row = await env.DB.prepare('SELECT id FROM event_plans WHERE id = ?')
        .bind(data.eventId)
        .first();
      if (!row) throw new HttpError(400, '保存済みの出店を選択');
    }
  }
  function present(row, user, members) {
    return {
      id: row.id,
      kind: row.kind,
      data: JSON.parse(row.data),
      author: members[row.owner] || '共有メンバー',
      updatedBy: members[row.updated_by] || '共有メンバー',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
      canEdit: row.kind !== 'review' || row.owner === user.id,
    };
  }
  return async function route(request, url, env, user, members, json) {
    const match = url.pathname.match(/^\/records\/([0-9a-f-]+)$/i);
    if (url.pathname === '/records' && request.method === 'GET') {
      const cursor = url.searchParams.get('cursor') || '';
      if (cursor && !UUID.test(cursor)) throw new HttpError(400, '取得位置を確認');
      const result = await env.DB.prepare(
        'SELECT * FROM records WHERE deleted = 0 AND id > ? ORDER BY id LIMIT 101'
      )
        .bind(cursor)
        .all();
      const rows = result.results.slice(0, 100);
      return json({
        records: rows.map((row) => present(row, user, members)),
        next: result.results.length > 100 ? rows.at(-1).id : null,
      });
    }
    if (url.pathname === '/records' && request.method === 'POST') {
      const body = await readBody(request);
      if (!UUID.test(body.id)) throw new HttpError(400, '記録番号を確認');
      await checkEvent(body.data, env);
      const data = JSON.stringify(validate(body.kind, body.data)),
        now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO records (id,kind,owner,data,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING'
      )
        .bind(body.id, body.kind, user.id, data, now, now, user.id)
        .run();
      const row = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(body.id).first();
      if (row.owner !== user.id || row.kind !== body.kind || row.data !== data || row.deleted)
        throw new HttpError(409, '記録番号が競合。再読込して確認');
      return json({ record: present(row, user, members) }, 201);
    }
    if (match && UUID.test(match[1]) && ['PATCH', 'DELETE'].includes(request.method)) {
      const body = await readBody(request);
      if (!Number.isSafeInteger(body.version) || body.version < 1)
        throw new HttpError(400, '更新番号を確認');
      const row = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND deleted = 0')
        .bind(match[1])
        .first();
      if (!row) throw new HttpError(404, '記録なし。再読込して確認');
      if (row.kind === 'review' && row.owner !== user.id)
        throw new HttpError(403, '振り返りは書いた本人だけ編集可能');
      const now = new Date().toISOString();
      if (request.method === 'PATCH') await checkEvent(body.data, env);
      const statement =
        request.method === 'PATCH'
          ? env.DB.prepare(
              'UPDATE records SET data = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted = 0'
            ).bind(
              JSON.stringify(validate(row.kind, body.data)),
              now,
              user.id,
              row.id,
              body.version
            )
          : env.DB.prepare(
              'UPDATE records SET deleted = 1, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted = 0'
            ).bind(now, user.id, row.id, body.version);
      if ((await statement.run()).meta.changes !== 1)
        throw new HttpError(409, '別の画面で変更済み。入力を控えて再読込');
      if (request.method === 'DELETE') return json({ deleted: true });
      const updated = await env.DB.prepare('SELECT * FROM records WHERE id = ?')
        .bind(row.id)
        .first();
      return json({ record: present(updated, user, members) });
    }
    throw new HttpError(405, '操作対象を確認');
  };
}
