'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

type Config = { swissquoteGuardian: string; treasury: string };
let cache: Config | null = null;

export function useConfig() {
  const [cfg, setCfg] = useState<Config | null>(cache);
  useEffect(() => { if (!cache) api<Config>('/api/config').then((c) => { cache = c; setCfg(c); }); }, []);
  return cfg;
}
