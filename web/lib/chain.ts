// Isomorphic on-chain helpers built on abstractionkit (Safe v1.4.1 + Safe4337Module v0.3.0, EntryPoint v0.7).
import {
  SafeAccountV0_3_0 as Safe,
  SocialRecoveryModule,
  type MetaTransaction,
  type WebauthnPublicKey,
} from 'abstractionkit';
import {
  createPublicClient,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  type Hex,
  isAddressEqual,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { RECOVERY_MODULE, USDC } from './config';

export { Safe };
export const srm = new SocialRecoveryModule(RECOVERY_MODULE);
export const MULTISEND = Safe.DEFAULT_MULTISEND_CONTRACT_ADDRESS;
export const SIGNER_FACTORY = Safe.DEFAULT_WEB_AUTHN_SIGNER_FACTORY;

export const erc20Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
export const srmAbi = parseAbi([
  'function addGuardianWithThreshold(address guardian, uint256 threshold)',
  'function revokeGuardianWithThreshold(address prevGuardian, address guardian, uint256 threshold)',
  'function changeThreshold(uint256 threshold)',
  'function cancelRecovery()',
  'function getRecoveryRequest(address wallet) view returns ((uint64 guardiansApprovalCount, uint128 newThreshold, uint64 executeAfter, address[] newOwners))',
  'function getGuardians(address wallet) view returns (address[])',
  'function threshold(address wallet) view returns (uint256)',
  'function nonce(address wallet) view returns (uint256)',
]);
const safeAbi = parseAbi([
  'function enableModule(address module)',
  'function swapOwner(address prevOwner, address oldOwner, address newOwner)',
  'function getOwners() view returns (address[])',
  'function isModuleEnabled(address module) view returns (bool)',
]);
const factoryAbi = parseAbi(['function createSigner(uint256 x, uint256 y, uint176 verifiers) returns (address)']);
const multisendAbi = parseAbi(['function multiSend(bytes transactions)']);
export const erc1271Abi = parseAbi(['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)']);

export function client(rpcUrl: string) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

export type PublicKey = { x: bigint; y: bigint };
export type GuardianB =
  | { type: 'passkey'; x: bigint; y: bigint; credentialId: string; address: string }
  | { type: 'card'; address: string };

/** Address of the per-key SafeWebAuthnSignerProxy for a passkey. This is what the Safe lists as owner. */
export function passkeySignerAddress(pub: PublicKey) {
  return getAddress(Safe.createWebAuthnSignerVerifierAddress(pub.x, pub.y));
}

export function counterfactualAddress(pub: PublicKey) {
  return getAddress(Safe.createAccountAddress([pub as WebauthnPublicKey]));
}

/** First transaction: deploy the Safe and switch on recovery in the same UserOperation. */
export function setupTransactions(wallet: string, guardianA: string, guardianB: GuardianB): MetaTransaction[] {
  const txs: MetaTransaction[] = [];
  if (guardianB.type === 'passkey') txs.push(Safe.createDeployWebAuthnVerifierMetaTransaction(guardianB.x, guardianB.y));
  txs.push(Safe.createEnableModuleMetaTransaction(RECOVERY_MODULE, wallet));
  txs.push(srm.createAddGuardianWithThresholdMetaTransaction(guardianA, 1n));
  txs.push(srm.createAddGuardianWithThresholdMetaTransaction(guardianB.address, 2n));
  return txs;
}

export function transferTx(to: string, amount: bigint): MetaTransaction {
  return { to: USDC.address, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to as Hex, amount] }) };
}

export function approveTx(spender: string, amount: bigint): MetaTransaction {
  return { to: USDC.address, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender as Hex, amount] }) };
}

export function cancelRecoveryTx(): MetaTransaction {
  return srm.createCancelRecoveryMetaTransaction();
}

export type Call = { to: string; value: bigint; data: Hex; operation: number };

/** Unpack a Safe4337 executeUserOp call, including MultiSend batches, into individual calls. */
export function decodeCalls(callData: string): Call[] {
  const [meta] = Safe.decodeAccountCallData(callData);
  const op = Number(meta.operation ?? 0);
  if (isAddressEqual(meta.to as Hex, MULTISEND as Hex) && op === 1) {
    const { args } = decodeFunctionData({ abi: multisendAbi, data: meta.data as Hex });
    const bytes = (args[0] as string).slice(2);
    const calls: Call[] = [];
    let i = 0;
    while (i < bytes.length) {
      const operation = parseInt(bytes.slice(i, i + 2), 16); i += 2;
      const to = getAddress('0x' + bytes.slice(i, i + 40)); i += 40;
      const value = BigInt('0x' + bytes.slice(i, i + 64)); i += 64;
      const len = Number(BigInt('0x' + bytes.slice(i, i + 64))); i += 64;
      const data = ('0x' + bytes.slice(i, i + len * 2)) as Hex; i += len * 2;
      calls.push({ to, value, data, operation });
    }
    return calls;
  }
  return [{ to: getAddress(meta.to), value: BigInt(meta.value ?? 0), data: meta.data as Hex, operation: op }];
}

export type DecodedCall =
  | { kind: 'transfer'; to: string; amount: bigint }
  | { kind: 'approve'; spender: string; amount: bigint }
  | { kind: 'security'; action: string }
  | { kind: 'unknown'; to: string; selector: string };

export function classifyCall(call: Call, wallet: string): DecodedCall {
  const selector = call.data.slice(0, 10);
  if (call.operation !== 0 || call.value !== 0n) return { kind: 'unknown', to: call.to, selector };
  try {
    if (isAddressEqual(call.to as Hex, USDC.address)) {
      const d = decodeFunctionData({ abi: erc20Abi, data: call.data });
      if (d.functionName === 'transfer') return { kind: 'transfer', to: getAddress(d.args[0] as string), amount: d.args[1] as bigint };
      if (d.functionName === 'approve') return { kind: 'approve', spender: getAddress(d.args[0] as string), amount: d.args[1] as bigint };
    }
    if (isAddressEqual(call.to as Hex, wallet as Hex)) {
      const d = decodeFunctionData({ abi: safeAbi, data: call.data });
      if (d.functionName === 'enableModule' && isAddressEqual(d.args[0] as Hex, RECOVERY_MODULE)) return { kind: 'security', action: 'Turn on recovery' };
      // abstractionkit's first operation swaps the temporary shared WebAuthn signer for the passkey's own signer contract.
      if (d.functionName === 'swapOwner' && isAddressEqual(d.args[1] as Hex, Safe.DEFAULT_WEB_AUTHN_SHARED_SIGNER as Hex)) return { kind: 'security', action: 'Make your passkey the owner' };
    }
    if (isAddressEqual(call.to as Hex, RECOVERY_MODULE)) {
      const d = decodeFunctionData({ abi: srmAbi, data: call.data });
      const names: Record<string, string> = {
        addGuardianWithThreshold: 'Add a recovery guardian',
        revokeGuardianWithThreshold: 'Remove a recovery guardian',
        changeThreshold: 'Change recovery threshold',
        cancelRecovery: 'Cancel a pending recovery',
      };
      if (names[d.functionName]) return { kind: 'security', action: names[d.functionName] };
    }
    if (isAddressEqual(call.to as Hex, SIGNER_FACTORY as Hex)) {
      decodeFunctionData({ abi: factoryAbi, data: call.data });
      return { kind: 'security', action: 'Register a passkey signer' };
    }
  } catch {
    /* fall through */
  }
  return { kind: 'unknown', to: call.to, selector };
}

export type WalletState = {
  address: string;
  deployed: boolean;
  owners: string[];
  guardians: string[];
  threshold: bigint;
  recovery: { approvals: bigint; executeAfter: bigint; newOwners: string[] } | null;
  usdc: bigint;
  eth: bigint;
};

export async function readWalletState(rpcUrl: string, address: string): Promise<WalletState> {
  const c = client(rpcUrl);
  const a = address as Hex;
  const code = await c.getCode({ address: a });
  const deployed = !!code && code !== '0x';
  const [usdc, eth] = await Promise.all([
    c.readContract({ address: USDC.address, abi: erc20Abi, functionName: 'balanceOf', args: [a] }),
    c.getBalance({ address: a }),
  ]);
  if (!deployed) return { address, deployed, owners: [], guardians: [], threshold: 0n, recovery: null, usdc, eth };
  const [owners, guardians, threshold, req] = await Promise.all([
    c.readContract({ address: a, abi: safeAbi, functionName: 'getOwners' }),
    c.readContract({ address: RECOVERY_MODULE, abi: srmAbi, functionName: 'getGuardians', args: [a] }),
    c.readContract({ address: RECOVERY_MODULE, abi: srmAbi, functionName: 'threshold', args: [a] }),
    c.readContract({ address: RECOVERY_MODULE, abi: srmAbi, functionName: 'getRecoveryRequest', args: [a] }),
  ]);
  const recovery = req.executeAfter > 0n
    ? { approvals: BigInt(req.guardiansApprovalCount), executeAfter: BigInt(req.executeAfter), newOwners: [...req.newOwners] }
    : null;
  return { address, deployed, owners: [...owners], guardians: [...guardians], threshold, recovery, usdc, eth };
}

/** EIP-1271 check against a deployed signer contract (passkey proxy). */
export async function isValid1271(rpcUrl: string, signer: string, hash: Hex, signature: Hex) {
  try {
    const res = await client(rpcUrl).readContract({ address: signer as Hex, abi: erc1271Abi, functionName: 'isValidSignature', args: [hash, signature] });
    return res === '0x1626ba7e';
  } catch {
    return false;
  }
}
