// Shared constants for client and server. Everything here is public.
export const CHAIN_ID = 84532n; // Base Sepolia
export const CHAIN_NAME = 'Base Sepolia';
export const EXPLORER = 'https://sepolia.basescan.org';

// Upstream endpoints. The browser never calls these directly; it goes through /api/rpc/*.
export const NODE_RPC = process.env.NODE_RPC_URL ?? 'https://sepolia.base.org';
export const BUNDLER_RPC = process.env.BUNDLER_RPC_URL ?? 'https://api.candide.dev/public/v3/84532';
export const PAYMASTER_RPC = process.env.PAYMASTER_RPC_URL ?? 'https://api.candide.dev/public/v3/84532';

// Candide Social Recovery Module. The 3-minute deployment stands in for the 3-day production module
// (SocialRecoveryModuleGracePeriodSelector.After3Days = 0x38275826E1933303E508433dD5f289315Da2541c).
export const RECOVERY_MODULE = '0x949d01d424bE050D09C16025dd007CB59b3A8c66';
export const RECOVERY_DELAY_LABEL = '3 minutes';
export const RECOVERY_DELAY_PRODUCTION = '3 days';

// Circle USDC on Base Sepolia.
export const USDC = {
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  symbol: 'USDC',
  decimals: 6,
} as const;

// Sponsored-lane parameters.
export const SERVICE_FEE = 50_000n; // 0.05 USDC, batched into every sponsored transfer
export const STEP_UP_THRESHOLD = BigInt(process.env.NEXT_PUBLIC_STEP_UP_THRESHOLD ?? '5000000'); // 5 USDC
export const USDC_CHF = 0.8; // indicative mock rate

// Allowlisted dApp contracts on Base Sepolia.
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
export const UNIVERSAL_ROUTER = '0x492E6456D9528771018DeB9E87ef7750EF184104';

// Demo address book. The sanctioned address is a real OFAC SDN entry (Lazarus Group, Ronin bridge exploit).
export const CONTACTS = [
  { name: 'Bob Keller', address: '0x3C36F1ac17b9818b4e45bD4909b04bd3adEcfB3b', note: 'Friend' },
  { name: 'Sara Rossi', address: '0xBd22D912e1CB57210eDF853B8A4481e57b434408', note: 'Landlord' },
  { name: 'Unknown recipient', address: '0x098B716B8Aaf21512996dC57EB0615e2383E2f96', note: 'Demo: sanctioned address' },
] as const;

export const DEMO_CLIENT = { clientId: '2162953', password: 'demo', name: 'Anna Müller', email: 'anna.mueller@example.ch' };
