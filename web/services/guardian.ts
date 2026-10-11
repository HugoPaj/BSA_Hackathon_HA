// One guardian as its own local process. GUARDIAN_ROLE=swissquote (port 4101) or partner (port 4102).
import path from 'node:path';
import { createGuardian, ROLES, type Role } from './guardian-core';
import { serve } from './serve';

const role = (process.env.GUARDIAN_ROLE ?? 'swissquote') as Role;
if (!ROLES[role]) throw new Error(`GUARDIAN_ROLE must be one of ${Object.keys(ROLES).join(', ')}`);
const dir = process.env.GUARDIAN_DATA_DIR ?? path.join(process.cwd(), '.data', `guardian-${role}`);
const g = createGuardian(role, { dir });

serve(role, g.routes, Number(process.env.PORT ?? ROLES[role].port), async () => {
  const { guardian } = await g.account();
  console.log(`[${role}] ${g.cfg.name} on http://127.0.0.1:${process.env.PORT ?? ROLES[role].port} · guardian key ${guardian.address} · storage ${dir}`);
  if (role === 'swissquote') for (const [name, key] of [['liveness vendor', g.livenessVendor], ['passport guardian', g.passportAttestor]] as const) {
    await key().then((k) => console.log(`[${role}] trusts the ${name} key ${k}`), () => console.log(`[${role}] no ${name} key configured: its verdicts are refused`));
  }
});
