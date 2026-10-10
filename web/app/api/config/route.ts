import { fail, json } from '@/lib/server/session';
import { guardianSafe } from '@/lib/server/guardians';
import { opsAddress } from '@/lib/server/aa';

export async function GET() {
  try {
    // Guardian A: the 1-of-2 Safe of Swissquote's guardian HSM and the independent partner, deployed on first use.
    const { address } = await guardianSafe();
    return json({ swissquoteGuardian: address, treasury: opsAddress() });
  } catch (e) {
    return fail((e as Error).message, 503);
  }
}
