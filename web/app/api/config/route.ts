import { json } from '@/lib/server/session';
import { guardianAccount } from '@/lib/server/keys';
import { opsAddress } from '@/lib/server/aa';

export async function GET() {
  return json({ swissquoteGuardian: guardianAccount().address, treasury: opsAddress() });
}
