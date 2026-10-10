# Swissquote Wallet Challenge - Proposed Solution

## Challenge summary
Build the self-custody wallet Swissquote could realistically launch for its clients. Users get full control of their crypto and keys while preserving the security, simplicity, compliance and UX of a Swiss bank. Must demo the full lifecycle: creation, authentication, transaction signing, loss of access, recovery. Must sign and send a real transaction (testnet OK). Must define custody model, threat model, architecture, key location, auth before signing. Recovery must protect legitimate users without easy attacker path or giving Swissquote unintended control. Banking infra / compliance providers / key-share servers may be mocked if documented.

Judging: technical implementation 35, security & custody design 20, legal feasibility 15, business case 15, UX & pitch 15. Bonus up to 20: gasless transactions, compliant dApp interaction (allowlists, sanctions screening, simulation, high-value checks), recovery that distinguishes legit user from attacker with compromised phone/email, strong business case, Swiss regulatory considerations (custody, wallet ownership verification).

## Recommendation in one line
A passkey-signed Safe smart account where Swissquote is a recovery guardian but never a spending signer. The user is the only one who can move funds. Swissquote can only help replace a lost key, together with a second factor the user holds, after a delay the user can veto.

## Custody model
- Spending key: a passkey (WebAuthn, P-256) stored in the phone's secure enclave. Face ID / fingerprint approves every transaction. No seed phrase is ever shown.
- Account: a Safe smart account with the ERC-4337 module. Audited, bank-grade; recovery and paymaster pieces exist as plug-ins so almost no custom contract code.
- Recovery (2-of-3 guardians, 48h delay): guardian A = Swissquote, acting only after the client re-passes bank login and ID liveness check. Guardian B = a recovery kit the user holds (printed QR or second-device passkey). Guardian C = optional trusted contact. Two guardians propose a new passkey, delay starts, current passkey can cancel at any time, then the swap executes.
- Hard case defence: attacker with victim's phone and email cannot sign (passkey demands biometrics). Cannot recover (Swissquote guardian requires face match against bank KYC file, and attacker lacks offline kit). Victim gets push/email/in-app alerts and vetoes from any remaining device.
- No unintended Swissquote control: it holds no signing share and is one of two required guardians. It can never move funds or rotate the owner alone.

## Coverage of judged points
| Requirement | What we build |
|---|---|
| Create | Open wallet from inside a mocked Swissquote app. One tap creates a passkey and a counterfactual Safe address. Fund from "Swissquote account" with testnet USDC. |
| Authenticate and sign | Face ID signs a real USDC transfer on Base Sepolia via a bundler. |
| Gasless (bonus) | Pimlico paymaster sponsors gas; Swissquote takes a small USDC fee. User never touches ETH. |
| Compliant dApps (bonus) | WalletConnect with an allowlist. Before signing, show simulation (Tenderly / Alchemy simulate) and a mocked sanctions check. Above a threshold, require recovery kit as second confirmation. Enforced in the paymaster: Swissquote refuses to sponsor gas for a blocked tx, while the user can still pay gas themselves. Compliance without seizing control. |
| Loss and recovery | Kill first browser profile. Recover on second device with Swissquote mock KYC plus kit QR. Demo delay at 2 minutes. Replay as attacker and veto from old device. |
| Swiss regulation | Under the DLT Act, assets are segregated in bankruptcy and not a deposit only if the client keeps exclusive power of disposal; design proves that on-chain. Wallet ownership verification for Travel Rule transfers is automatic: address was created by a KYC'd client who signs a proof with their passkey, so withdrawals to this wallet need no manual proof. |
| Business case | Assets stay one tap from trading instead of leaving to MetaMask. Revenue from paymaster fees and swaps. Lower ops cost from automated wallet verification and fewer withdrawal tickets. New clients who want DeFi with a bank behind recovery. |

## Stack and what is mocked
- Real: Safe + Safe4337 module + Safe passkey signer (SafeWebAuthnSignerFactory), Candide's audited Social Recovery Module for guardians and delay, Pimlico bundler and paymaster, viem and permissionless.js, Next.js front end. Everything on Base Sepolia.
- Mocked, clearly labelled: Swissquote login and liveness check, HSM holding the Swissquote guardian key, sanctions API, fiat funding.

Where keys live: user passkey in secure enclave; recovery kit offline with user; Swissquote guardian key in an HSM; policy enforced in the paymaster and dApp allowlist. No party holds a full key except the user.

Fallback: ZeroDev Kernel ships passkey signing and recovery out of the box, but Safe pitches better to a bank.
