// Guardian A is a plain Safe v1.4.1 (1-of-2) owned by two independent guardian services: Swissquote's HSM and
// an independent recovery partner. Either one can approve as Guardian A, so recovery survives Swissquote
// disappearing. Both together are still only one guardian, so they can never recover without the client's factor.
import type { MetaTransaction } from 'abstractionkit';
import {
  concat,
  encodeFunctionData,
  getContractAddress,
  isAddressEqual,
  keccak256,
  parseAbi,
  zeroAddress,
  type Hex,
} from 'viem';
import { CHAIN_ID } from './config';
import { client } from './chain';

// Canonical Safe v1.4.1 deployments (same address on every chain).
export const SAFE_SINGLETON = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
export const SAFE_PROXY_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
// Provides EIP-1271 isValidSignature for the Safe, which the recovery module calls for contract guardians.
export const COMPATIBILITY_FALLBACK_HANDLER = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99';
const SALT_NONCE = 0x51570an; // fixed: the address depends only on the two guardian keys

const safeAbi = parseAbi([
  'function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
]);
const factoryAbi = parseAbi([
  'function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address)',
  'function proxyCreationCode() pure returns (bytes)',
]);

const sorted = (owners: string[]) => [...owners].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)) as Hex[];

function initializer(owners: string[]) {
  return encodeFunctionData({
    abi: safeAbi,
    functionName: 'setup',
    args: [sorted(owners), 1n, zeroAddress, '0x', COMPATIBILITY_FALLBACK_HANDLER, zeroAddress, 0n, zeroAddress],
  });
}

let creationCode: Hex | null = null;

/** CREATE2 address of the guardian Safe for these owner keys. */
export async function guardianSafeAddress(rpcUrl: string, owners: string[]) {
  creationCode ??= await client(rpcUrl).readContract({ address: SAFE_PROXY_FACTORY, abi: factoryAbi, functionName: 'proxyCreationCode' });
  const salt = keccak256(concat([keccak256(initializer(owners)), `0x${SALT_NONCE.toString(16).padStart(64, '0')}`]));
  const bytecode = concat([creationCode, `0x${BigInt(SAFE_SINGLETON).toString(16).padStart(64, '0')}`]);
  return getContractAddress({ opcode: 'CREATE2', from: SAFE_PROXY_FACTORY, salt, bytecode });
}

export function deployGuardianSafeTx(owners: string[]): MetaTransaction {
  return {
    to: SAFE_PROXY_FACTORY,
    value: 0n,
    data: encodeFunctionData({ abi: factoryAbi, functionName: 'createProxyWithNonce', args: [SAFE_SINGLETON, initializer(owners), SALT_NONCE] }),
  };
}

/** Owners and threshold, or null if the address is not a deployed Safe. */
export async function readGuardianSafe(rpcUrl: string, address: string) {
  const c = client(rpcUrl);
  try {
    const [owners, threshold] = await Promise.all([
      c.readContract({ address: address as Hex, abi: safeAbi, functionName: 'getOwners' }),
      c.readContract({ address: address as Hex, abi: safeAbi, functionName: 'getThreshold' }),
    ]);
    return { owners: [...owners], threshold };
  } catch {
    return null;
  }
}

export const isOwnedBy = (safe: { owners: string[] }, key: string) => safe.owners.some((o) => isAddressEqual(o as Hex, key as Hex));

/**
 * What one guardian service signs so the Safe accepts it under EIP-1271: the CompatibilityFallbackHandler wraps
 * the recovery hash in a SafeMessage for this Safe. With threshold 1, one owner's signature is the Safe's signature.
 */
export function safeMessageTypedData(guardianSafe: string, hash: Hex) {
  return {
    domain: { chainId: Number(CHAIN_ID), verifyingContract: guardianSafe as Hex },
    types: { SafeMessage: [{ name: 'message', type: 'bytes' }] },
    primaryType: 'SafeMessage',
    message: { message: hash },
  } as const;
}
