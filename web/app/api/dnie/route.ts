import { toHex } from 'viem';
import { createDnieRequest, dnieRequestByToken, publicDnieRequest, submitDnieResult, type DnieResult } from '@/lib/server/dnie';
import { body, currentClient, fail, json, toClient } from '@/lib/server/session';

// DNIe signature requests. The wallet (logged in) creates them; the Swissquote ID app on the phone reads and fulfils
// them with the request token, since it has no Swissquote session. Recovery and step-up requests are created by
// /api/recovery and /api/stepup, which own those flows.

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    return json(publicDnieRequest(await dnieRequestByToken(url.searchParams.get('id') ?? '', url.searchParams.get('token') ?? '')));
  } catch (e) {
    return fail((e as Error).message, 404);
  }
}

type Req = { action: 'create'; purpose: 'enroll' } | ({ action: 'result'; id: string; token: string } & DnieResult);

export async function POST(req: Request) {
  const b = await body<Req>(req);
  if (b.action === 'create') {
    const client = await currentClient();
    if (!client) return fail('Not logged in', 401);
    if (b.purpose !== 'enroll') return fail('Unknown purpose');
    const r = await createDnieRequest({
      clientId: client.clientId, purpose: 'enroll', hash: toHex(crypto.getRandomValues(new Uint8Array(32))), title: 'Add your DNI as recovery factor',
      lines: [`Swissquote client ${client.name}.`, 'Your DNI becomes Guardian B: it can approve a recovery of your wallet together with Swissquote, and never spend.', 'This first signature checks that your PIN works.'],
    });
    return json({ ...publicDnieRequest(r), token: r.token });
  }
  if (b.action === 'result') {
    try {
      const r = await dnieRequestByToken(b.id, b.token);
      const done = await submitDnieResult(r, b, toClient(r.clientId)?.name ?? 'Swissquote client');
      return json(publicDnieRequest(done));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
  return fail('Unknown action');
}
