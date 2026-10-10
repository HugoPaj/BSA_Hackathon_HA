// The mocked share holders, deployed as the separate services project: its own Vercel project with its own
// database (SERVICES_DATABASE_URL). The Swissquote web app is built from the same code but never gets that
// database's URL, so there these routes answer 404 and it can only reach the guardians over HTTP like anyone else.
import { createGuardian } from '@/services/guardian-core';
import { createLiveness } from '@/services/liveness-core';
import { handle, type Routes } from '@/services/store';

const enabled = !!process.env.SERVICES_DATABASE_URL;
const self = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000';
const livenessUrl = process.env.LIVENESS_URL ?? `${self}/api/svc/liveness`;

let services: Record<string, Routes> | undefined;
const routes = (name: string) => {
  services ??= {
    swissquote: createGuardian('swissquote', { livenessUrl }).routes,
    partner: createGuardian('partner', { livenessUrl }).routes,
    liveness: createLiveness().routes,
  };
  return services[name];
};

async function serve(req: Request, { params }: { params: Promise<{ service: string; path: string[] }> }) {
  const { service, path } = await params;
  const r = enabled && routes(service);
  if (!r) return Response.json({ error: 'Not found' }, { status: 404 });
  const { status, data } = await handle(service, r, req.method, '/' + path.join('/'), req.method === 'GET' ? '' : await req.text());
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export { serve as GET, serve as POST };
