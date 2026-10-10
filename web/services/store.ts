// Each mocked share holder's own storage: a JSON file per key under its data directory locally, or rows in the
// services' own Postgres database (SERVICES_DATABASE_URL) when deployed. The Swissquote web backend never has
// that database's URL, so it cannot read a guardian's key.
import fs from 'node:fs';
import path from 'node:path';
import { Client, neon } from '@neondatabase/serverless';

export type Store = {
  get<T>(key: string): Promise<T | undefined>;
  /** Read-modify-write of one key, atomic across concurrent requests. */
  update<T>(key: string, fn: (current: T | undefined) => T): Promise<T>;
};

const DATABASE_URL = process.env.SERVICES_DATABASE_URL;

export function createStore(ns: string, dir: string): Store {
  return DATABASE_URL ? dbStore(ns, DATABASE_URL) : fileStore(dir);
}

function fileStore(dir: string): Store {
  const file = (key: string) => path.join(dir, `${key}.json`);
  const get = async <T>(key: string) => (fs.existsSync(file(key)) ? (JSON.parse(fs.readFileSync(file(key), 'utf8')) as T) : undefined);
  return {
    get,
    async update<T>(key: string, fn: (current: T | undefined) => T) {
      const next = fn(await get<T>(key));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(key), JSON.stringify(next, null, 2), { mode: 0o600 });
      return next;
    },
  };
}

let table: Promise<unknown> | undefined;

function dbStore(ns: string, url: string): Store {
  const ensureTable = () => (table ??= neon(url).query('create table if not exists svc_store (ns text not null, key text not null, doc text not null, primary key (ns, key))').catch((e) => { table = undefined; throw e; }));
  return {
    async get<T>(key: string) {
      await ensureTable();
      const rows = await neon(url).query('select doc from svc_store where ns = $1 and key = $2', [ns, key]);
      return rows[0] ? (JSON.parse(rows[0].doc) as T) : undefined;
    },
    async update<T>(key: string, fn: (current: T | undefined) => T) {
      await ensureTable();
      const client = new Client(url);
      await client.connect();
      try {
        await client.query('begin');
        await client.query("insert into svc_store (ns, key, doc) values ($1, $2, 'null') on conflict do nothing", [ns, key]);
        const { rows } = await client.query('select doc from svc_store where ns = $1 and key = $2 for update', [ns, key]);
        const next = fn((JSON.parse(rows[0].doc) ?? undefined) as T | undefined);
        await client.query('update svc_store set doc = $3 where ns = $1 and key = $2', [ns, key, JSON.stringify(next)]);
        await client.query('commit');
        return next;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        await client.end();
      }
    },
  };
}

/** An error the caller caused: refused requests and bad input. Anything else is a 500. */
export class ServiceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export type Routes = Record<string, (body: never) => Promise<unknown>>;

/** Run one request against a service's routes. Shared by the local HTTP server and the deployed function. */
export async function handle(name: string, routes: Routes, method: string, pathname: string, raw: string): Promise<{ status: number; data: unknown }> {
  const route = routes[`${method} ${pathname}`];
  if (!route) return { status: 404, data: { error: 'Not found' } };
  try {
    return { status: 200, data: await route((raw ? JSON.parse(raw) : {}) as never) };
  } catch (e) {
    if (!(e instanceof ServiceError)) console.error(`[${name}]`, e);
    return { status: e instanceof ServiceError ? e.status : 500, data: { error: (e as Error).message } };
  }
}
