import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

export type DbAdminTargetInput = {
  id: string;
  label: string;
  url: string;
  key: string;
  client: SupabaseClient | null;
  /** Postgres connection string if available for SQL / information_schema. */
  pgUrl?: string | null;
};

type PublicTarget = {
  id: string;
  label: string;
  host: string;
  hasRest: boolean;
  hasSql: boolean;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SQL_MAX_ROWS = 500;
const PG_CONNECT_TIMEOUT_MS = 8000;

function hostFromUrl(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 48);
  }
}

function clampLimit(raw: unknown) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

function clampOffset(raw: unknown) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(1_000_000, n);
}

function safeTableName(raw: unknown) {
  const name = String(raw || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return '';
  return name;
}

async function withPg<T>(
  connectionString: string,
  run: (client: pg.Client) => Promise<T>
): Promise<T> {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

async function listTablesViaOpenApi(url: string, key: string): Promise<string[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/openapi+json'
    }
  });
  if (!res.ok) {
    throw new Error(`OpenAPI ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  const doc = (await res.json()) as { paths?: Record<string, unknown> };
  const paths = doc.paths || {};
  return Object.keys(paths)
    .map(p => p.replace(/^\//, ''))
    .filter(name => name && !name.includes('{') && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
    .sort((a, b) => a.localeCompare(b));
}

async function listTablesViaPg(pgUrl: string): Promise<string[]> {
  return withPg(pgUrl, async client => {
    const result = await client.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`
    );
    return result.rows.map(r => r.table_name);
  });
}

async function primaryKeysViaPg(pgUrl: string, table: string): Promise<string[]> {
  return withPg(pgUrl, async client => {
    const result = await client.query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
       where tc.table_schema = 'public'
         and tc.table_name = $1
         and tc.constraint_type = 'PRIMARY KEY'
       order by kcu.ordinal_position`,
      [table]
    );
    return result.rows.map(r => r.column_name);
  });
}

function guessPrimaryKeys(row: Record<string, unknown> | undefined): string[] {
  if (!row) return ['id'];
  if ('id' in row) return ['id'];
  const keys = Object.keys(row);
  const idLike = keys.filter(k => /(^id$|_id$)/i.test(k));
  return idLike.length > 0 ? idLike.slice(0, 3) : keys.slice(0, 1);
}

export function dbAdminRouter(targets: DbAdminTargetInput[]) {
  const router = Router();
  const byId = new Map(targets.map(t => [t.id, t]));

  const publicTargets = (): PublicTarget[] =>
    targets
      .filter(t => t.client || t.pgUrl)
      .map(t => ({
        id: t.id,
        label: t.label,
        host: hostFromUrl(t.url),
        hasRest: Boolean(t.client && t.key),
        hasSql: Boolean(t.pgUrl)
      }));

  function resolveTarget(dbRaw: unknown) {
    const id = String(dbRaw || '').trim();
    const target = byId.get(id);
    if (!target) return null;
    return target;
  }

  router.get('/targets', (_req, res) => {
    res.json({ targets: publicTargets() });
  });

  router.get('/tables', async (req, res) => {
    try {
      const target = resolveTarget(req.query.db);
      if (!target) return res.status(400).json({ error: 'Thiếu hoặc sai db.' });

      let tables: string[] = [];
      if (target.pgUrl) {
        tables = await listTablesViaPg(target.pgUrl);
      } else if (target.url && target.key) {
        tables = await listTablesViaOpenApi(target.url, target.key);
      } else {
        return res.status(503).json({ error: `DB ${target.label} chưa cấu hình REST/SQL.` });
      }
      return res.json({ db: target.id, tables });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không tải được danh sách bảng.';
      return res.status(500).json({ error: message });
    }
  });

  router.get('/rows', async (req, res) => {
    try {
      const target = resolveTarget(req.query.db);
      if (!target?.client) return res.status(400).json({ error: 'DB không hỗ trợ đọc bảng qua REST.' });
      const table = safeTableName(req.query.table);
      if (!table) return res.status(400).json({ error: 'Tên bảng không hợp lệ.' });

      const limit = clampLimit(req.query.limit);
      const offset = clampOffset(req.query.offset);

      const { data, error, count } = await target.client
        .from(table)
        .select('*', { count: 'exact' })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });

      const rows = data ?? [];
      let primaryKeys: string[] = [];
      if (target.pgUrl) {
        try {
          primaryKeys = await primaryKeysViaPg(target.pgUrl, table);
        } catch {
          primaryKeys = [];
        }
      }
      if (primaryKeys.length === 0) {
        primaryKeys = guessPrimaryKeys(rows[0]);
      }

      return res.json({
        db: target.id,
        table,
        rows,
        total: count ?? rows.length,
        limit,
        offset,
        primaryKeys
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không tải được dòng.';
      return res.status(500).json({ error: message });
    }
  });

  router.patch('/rows', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const target = resolveTarget(body.db);
      if (!target?.client) return res.status(400).json({ error: 'DB không hỗ trợ cập nhật qua REST.' });
      const table = safeTableName(body.table);
      if (!table) return res.status(400).json({ error: 'Tên bảng không hợp lệ.' });

      const match =
        body.match && typeof body.match === 'object' && !Array.isArray(body.match)
          ? (body.match as Record<string, unknown>)
          : null;
      const values =
        body.values && typeof body.values === 'object' && !Array.isArray(body.values)
          ? (body.values as Record<string, unknown>)
          : null;
      if (!match || Object.keys(match).length === 0) {
        return res.status(400).json({ error: 'Thiếu match (khóa chính).' });
      }
      if (!values || Object.keys(values).length === 0) {
        return res.status(400).json({ error: 'Thiếu values cần cập nhật.' });
      }

      let query = target.client.from(table).update(values);
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value as never);
      }
      const { data, error } = await query.select('*');
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, rows: data || [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không cập nhật được.';
      return res.status(500).json({ error: message });
    }
  });

  router.delete('/rows', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const target = resolveTarget(body.db);
      if (!target?.client) return res.status(400).json({ error: 'DB không hỗ trợ xóa qua REST.' });
      const table = safeTableName(body.table);
      if (!table) return res.status(400).json({ error: 'Tên bảng không hợp lệ.' });

      const match =
        body.match && typeof body.match === 'object' && !Array.isArray(body.match)
          ? (body.match as Record<string, unknown>)
          : null;
      if (!match || Object.keys(match).length === 0) {
        return res.status(400).json({ error: 'Thiếu match (khóa chính).' });
      }

      let query = target.client.from(table).delete();
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value as never);
      }
      const { data, error } = await query.select('*');
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, rows: data || [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không xóa được.';
      return res.status(500).json({ error: message });
    }
  });

  router.post('/sql', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const target = resolveTarget(body.db);
      if (!target?.pgUrl) {
        return res.status(400).json({ error: 'DB này chưa có kết nối Postgres (SQL).' });
      }
      const sql = String(body.sql || '').trim();
      if (!sql) return res.status(400).json({ error: 'Thiếu câu SQL.' });
      if (sql.length > 50_000) return res.status(400).json({ error: 'SQL quá dài.' });

      const result = await withPg(target.pgUrl, async client => client.query(sql));
      const rows = Array.isArray(result.rows) ? result.rows.slice(0, SQL_MAX_ROWS) : [];
      return res.json({
        success: true,
        command: result.command,
        rowCount: result.rowCount ?? rows.length,
        fields: (result.fields || []).map(f => f.name),
        rows,
        truncated: Array.isArray(result.rows) && result.rows.length > SQL_MAX_ROWS
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chạy SQL thất bại.';
      return res.status(500).json({ error: message });
    }
  });

  return router;
}

/** Build Postgres URL for a Supabase project ref when password is known. */
export function buildSupabasePgUrl(projectUrl: string, password: string): string | null {
  const ref = projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref || !password) return null;
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}
