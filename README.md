# Swissquote Self-Custody Wallet

Hackathon prototype for the Swissquote Wallet Challenge: a wallet a Swiss bank could launch where **the client is the only one who can move funds**, signing with a passkey (Face ID, Touch ID, Windows Hello or device PIN), while Swissquote helps with recovery and pays gas, without ever gaining control.

- **Proposal and design rationale:** [docs/proposal.html](docs/proposal.html)
- **Design system:** [docs/design.md](docs/design.md), with a preview in [docs/style-tile.html](docs/style-tile.html)
- **Independent reviews of the plan:** [docs/review-codex.md](docs/review-codex.md), [docs/review-claude.md](docs/review-claude.md)
- **App:** [`web/`](web), a Next.js 16 responsive website that works on phones and computers

## What is real and what is mocked

| Real, on Base Sepolia | Mocked, and labelled in the UI |
|---|---|
| WebAuthn passkeys (P-256), verified on-chain for every transaction | Swissquote e-banking login |
| Safe v1.4.1 smart account, Safe4337Module v0.3.0, EntryPoint v0.7 | KYC liveness check (camera preview, outcome chosen in the demo) |
| Safe WebAuthn signer contracts (one per passkey) | HSM: the guardian key is a software key in `.data/keys.json` |
| Candide Social Recovery Module (3-minute testnet deployment; 3-day in production) | Sanctions list (one real OFAC SDN address as the demo entry) |
| EIP-712 guardian approvals, EIP-1271 guardian passkey, owner swap, old-key revocation | Fiat funding: a treasury Safe holding testnet USDC stands in for the crypto desk |
| Gas sponsorship (Candide paymaster), bundler, USDC transfers, batched service fee | Push and e-mail channels (the alerts are real; delivery is the in-app inbox and toasts) |
| Simulation: `eth_call` from the wallet plus bundler gas estimation | Trusted-contact sub-slot for Guardian A (designed, not wired into the recovery UI) |
| Ownership proof checked on-chain via EIP-1271 | |

No API key or testnet ETH is needed. Candide's public Base Sepolia endpoint provides the bundler and sponsors gas.

The public endpoint sponsors anyone who calls it, so the policy only holds inside this app: the bundler proxy blocks `pm_*` calls, but a caller can still reach Candide directly. In production, use a private Candide API key with a sponsorship policy (`PAYMASTER_RPC_URL` and `SPONSORSHIP_POLICY_ID` in `web/.env.example`). Both are server-side only, so the server's checks become the only route to sponsorship.

## Run it

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

Passkeys are bound to the hostname. Use `localhost` on the same machine, or one HTTPS hostname everywhere, such as a Tailscale `serve` URL or Vercel. Passkeys created on one hostname do not work on another.

To demo **Add money**, fund the operations Safe with Base Sepolia USDC from [faucet.circle.com](https://faucet.circle.com). Its address is shown in the [operations view](http://localhost:3000/backoffice) and on first start in `.data/keys.json` (derived). Everything else works with an empty treasury.

### Tests

```bash
node scripts/e2e-api.mjs              # backend + chain, software passkeys (~4 min: includes the recovery delay)
node scripts/e2e-ui.mjs               # real UI in headless Chromium with a virtual WebAuthn authenticator
node scripts/e2e-ui.mjs --recover     # ...plus the full recovery, the cancel banner and the old-passkey rejection (~5 min)
```

## Demo script (about 4 minutes)

1. **Create.** Log in as the demo client (pre-filled), then choose *Open self-custody wallet*. Create the passkey, add a recovery passkey on another device (or a PIN-locked recovery card), and leave bank-assisted recovery on. A single sponsored transaction then deploys the Safe, swaps in the passkey owner, enables the recovery module and registers both guardians.
2. **Prove.** Sign the ownership proof. Swissquote verifies it on-chain (EIP-1271) and archives it. This is FINMA 02/2019 wallet verification without screenshots.
3. **Fund.** *Add money* moves testnet USDC from the "Swissquote account" to the wallet.
4. **Send.** Pay Bob. The review shows the allowlist, sanctions screen, simulation, the 0.05 USDC fee and *Sponsored by Swissquote*. Face ID signs, and BaseScan shows the batched transfer. Above 5 USDC (sent or approved), the recovery factor confirms too.
5. **Compliance.** Send to *Unknown recipient* (an OFAC address), or click *Claim 500 tokens* on the drainer dApp. Swissquote **declines to sponsor**, explains why, and still offers *Send anyway, I pay gas in ETH*: it declines a service, it never blocks.
6. **Attack.** On another browser, log in and start a recovery. The attacker has no Guardian B (*I don't have it*) and fails the face check (*Simulate: someone else*). The owner's inbox and toasts show *Recovery attempt blocked*.
7. **Lose and recover.** Delete the passkey (Chrome DevTools > WebAuthn) or use a second device. On */recover*: create a new passkey, approve with the recovery device, pass the face check, and Swissquote's guardian signs. During the 3-minute delay, the original device shows *This wasn't me, cancel recovery*. After the delay, choose *Finish recovery*.
8. **Prove again.** The new passkey signs. *Security > Try the old passkey* is rejected on-chain (AA24). The operations view shows every decision in the audit log.

## Architecture

```
Browser (client)                         Swissquote backend (mock, Next.js route handlers)          Base Sepolia
───────────────                          ──────────────────────────────────────────────          ────────────
passkey (secure enclave) ──signs──▶ UserOp ──/api/sponsor──▶ policy: allowlist · simulation ·    Safe (owner = passkey signer)
builds UserOps (abstractionkit)           sanctions · fee · step-up ──▶ paymaster (gas only)    Safe4337Module + EntryPoint v0.7
                                   ◀── sponsored op (client checks callData unchanged)           Social Recovery Module
signs again, /api/tx ──────────────────▶ bundler ───────────────────────────────────────────▶   WebAuthn signer proxies
recovery: new passkey + Guardian B sig ─▶ /api/recovery: verify (EIP-1271) · liveness ·         USDC
                                          guardian key signs EIP-712 · relay multiConfirm ──▶
```

Key files:

| Concern | File |
|---|---|
| Chain helpers: setup batch, call decoding, wallet state | `web/lib/chain.ts` |
| Browser passkeys (create, sign, DER → low-s) | `web/lib/passkey.ts` |
| Client transaction flow (build → sponsor → step-up → sign → submit) | `web/lib/use-tx-flow.ts`, `web/lib/wallet-client.ts` |
| Sponsored-lane policy | `web/lib/server/policy.ts` |
| Paymaster and operations Safe relayer | `web/lib/server/aa.ts` |
| Recovery orchestration and guardian (HSM) policy | `web/lib/server/recovery.ts` |
| Recovery card (offline guardian key, PIN-encrypted) | `web/lib/card.ts` |

### Custody in one table

| Actor | Move funds | Replace the owner |
|---|---|---|
| Client's passkey | Yes | Yes, directly; can also cancel any pending recovery |
| Swissquote alone | No | No |
| Swissquote + client's recovery factor | No | After the delay, which the owner can cancel |
| Thief with phone + e-mail | No (needs biometrics) | No (no Guardian B, fails the face match) |
| Swissquote infrastructure compromised | No | No (still needs Guardian B) |

## Notes

- `docs/assets/fonts` and `web/public/fonts` contain Swissquote's proprietary SwissquoteCT webfonts. Keep the repository private.
- `.data/` holds the demo database and keys. It is git-ignored.
