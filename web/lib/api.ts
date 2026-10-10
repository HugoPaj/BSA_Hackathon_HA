'use client';
import { parse, stringify } from './json';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = unknown>(path: string, data?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (data === undefined ? 'GET' : 'POST'),
    headers: data === undefined ? undefined : { 'content-type': 'application/json' },
    body: data === undefined ? undefined : stringify(data),
    cache: 'no-store',
  });
  const text = await res.text();
  let out: T & { error?: string };
  try {
    out = parse(text);
  } catch {
    throw new ApiError(res.ok ? 'Unexpected response from server' : `Server error (${res.status})`, res.status);
  }
  if (!res.ok || out?.error) throw new ApiError(out?.error ?? `Request failed (${res.status})`, res.status);
  return out;
}
