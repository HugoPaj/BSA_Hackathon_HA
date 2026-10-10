import type { Hex } from 'viem';
import { NODE_RPC, USDC } from '@/lib/config';
import { client as rpc, erc20Abi, transferTx } from '@/lib/chain';
import { addActivity, audit, read } from '@/lib/server/db';
import { opsAddress, relay } from '@/lib/server/aa';
import { formatUsdc } from '@/lib/format';
import { body, currentClient, fail, json } from '@/lib/server/session';

// "Add money from your Swissquote account". Mock of the bank's own crypto desk: a treasury Safe sends testnet USDC.
export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const wallet = await read((db) => db.wallets[client.clientId]);
  if (!wallet) return fail('Open a wallet first');
  const { amount } = await body<{ amount: bigint }>(req);
  if (amount <= 0n || amount > 20_000_000n) return fail('Choose an amount up to 20 USDC');
  const treasury = await opsAddress();
  const balance = await rpc(NODE_RPC).readContract({ address: USDC.address, abi: erc20Abi, functionName: 'balanceOf', args: [treasury as Hex] });
  if (balance < amount) return fail(`The demo treasury holds only ${formatUsdc(balance)} USDC. Top it up at faucet.circle.com (Base Sepolia) to ${treasury}.`);
  try {
    const { txHash } = await relay([transferTx(wallet.address, amount)]);
    await addActivity({ wallet: wallet.address, type: 'receive', title: 'From your Swissquote account', amount, counterparty: treasury, txHash, status: 'confirmed', sponsored: true });
    await audit({ actor: 'Crypto desk', action: 'Transfer to client wallet', wallet: wallet.address, detail: `${formatUsdc(amount)} USDC. Destination ownership ${wallet.proof ? 'verified via EIP-1271 proof' : 'NOT yet verified'}`, outcome: 'approved' });
    return json({ txHash });
  } catch (e) {
    return fail((e as Error).message);
  }
}
