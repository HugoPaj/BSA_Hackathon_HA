# Adversarial review of `docs/PLAN.md`

Reviewed: [PLAN.md](/home/hugop/Projects/BSA_Hackathon/docs/PLAN.md)

## Executive verdict

The concept is credible, but the plan currently overclaims its security, regulatory certainty, and implementation readiness.

The core stack can work on Base Sepolia, but not exactly as described. In particular, a counterfactual passkey-only Safe cannot use `SafeWebAuthnSignerFactory` to deploy both the Safe and its signer in the first ERC-4337 operation. It needs `SafeWebAuthnSharedSigner`, a predeployed signer, or a non-4337 deployment path.

The complete proposed scope—passkeys, ERC-4337, paymaster, recovery, WalletConnect, simulation, sanctions policy, high-value two-factor authorization, KYC, and polished lifecycle UX—is too broad for 36 hours. A narrowed version is feasible.

Most importantly:

- Swissquote cannot spend unilaterally, but Swissquote plus any second guardian can replace the sole owner and thereby obtain full control.
- “An attacker with phone and email cannot win” is not established. If the attacker can unlock the phone with its PIN, the passkey may sign directly.
- Funding the counterfactual address before deploying it creates an unrecoverable loss case.
- The compliance and high-value controls are bypassable because they exist only in the UI/paymaster.
- The DLT Act and Travel Rule statements are materially overstated.

## Severity-ranked findings

### 1. Critical — Recovery grants joint takeover power, not merely “assistance”

The statement that Swissquote “can never move funds or rotate the owner” is only half true:

- Swissquote cannot do either alone.
- Swissquote plus the recovery kit or trusted contact can replace the entire owner set.
- Once replaced with an attacker-controlled owner, that owner can immediately move every asset.

Candide’s module deliberately gives a guardian quorum the ability to replace Safe owners. Once the delay ends, anyone can finalize the recovery. Its signatures bind the proposed new owners, threshold, wallet, nonce, and chain, which prevents Swissquote from silently changing the destination after the other guardian signs—but a colluding or compromised quorum has total takeover capability. [Candide contract and recovery design](https://github.com/candidelabs/candide-contracts)

The off-chain promise that Swissquote signs only after login and liveness is not enforced by the contract. To the contract, the Swissquote HSM is simply a guardian capable of approving any replacement owner.

**Fix**

Describe this precisely:

> Swissquote has no unilateral spending or recovery power. A quorum containing Swissquote may authorize replacement of all spending owners after a delay.

Add:

- Dual-control approval inside Swissquote for the guardian HSM.
- An HSM policy that only signs structured recovery payloads, never arbitrary hashes.
- Mandatory display of wallet, new owner fingerprint, nonce, chain and delay to the recovery-kit holder.
- An on-chain event monitor independent from the recovery API.
- A production path where the user can recover without Swissquote, such as kit + trusted contact. Otherwise Swissquote insolvency or refusal can permanently block recovery after passkey loss.

Do not say “no party holds a full key except the user.” Each guardian holds a complete guardian credential, even if it is not a spending credential.

---

### 2. Critical — Funding an undeployed counterfactual Safe can strand funds forever

The proposed creation flow computes a counterfactual address and then funds it. But until the Safe is deployed:

- The recovery module is not enabled.
- Guardian state does not exist.
- Recovery cannot execute.
- Deployment still requires a valid first passkey-signed UserOperation.

If the passkey is lost after funding but before the first UserOperation, the assets may be permanently stuck.

**Fix**

The lifecycle must be:

1. Create passkey.
2. Compute Safe address.
3. Submit a sponsored no-op/setup UserOperation that deploys the Safe and configures recovery.
4. Verify code, owner, modules and guardians on-chain.
5. Only then fund it.

This is an important demo case: show that the wallet is deployed and recovery-enabled before displaying “ready to receive.”

---

### 3. Critical — The compliance and high-value protections are not wallet-enforced

The plan says:

- WalletConnect has an allowlist.
- The paymaster refuses blocked transactions.
- Users can still pay gas themselves.
- High-value transactions require the recovery kit.

These statements do not form a coherent security boundary. A user, attacker, alternative frontend, or malicious dApp can bypass both the Swissquote UI and paymaster and submit the same UserOperation through another bundler while paying gas from the Safe.

Therefore:

- The allowlist is a sponsorship policy, not a dApp restriction.
- The sanctions check is a decision about Swissquote-funded gas, not transaction enforcement.
- The second confirmation is not real unless the Safe validates it on-chain.

An allowlisted WalletConnect peer can also request arbitrary approvals, delegatecalls, owner changes or interactions with non-allowlisted contracts. Allowlisting a domain is not equivalent to allowlisting calldata.

**Fix**

Choose one honest model:

- **Self-custody model:** Swissquote screens and sponsors acceptable transactions, but users remain free to self-fund others. Call it a “compliant sponsored lane,” not enforcement.
- **Policy-wallet model:** Install a reviewed Safe Guard or validator that enforces target, selector, token, spender, amount and second-signer rules on-chain. This materially expands implementation and audit scope.

For the hackathon, use the first model. Demonstrate:

- One allowed transaction that is simulated and sponsored.
- One blocked transaction that is not sponsored.
- A clear message that the user retains the ability to transact independently.

Drop the high-value second-factor claim unless it is actually enforced on-chain.

---

### 4. High — The named passkey deployment path is wrong for the first ERC-4337 operation

The components are broadly compatible, but `SafeWebAuthnSignerFactory` cannot create a passkey signer alongside a new Safe in the same ERC-4337 `initCode`. ERC-4337 account deployment permits only the account’s expected `CREATE2` deployment in that operation.

Safe created `SafeWebAuthnSharedSigner` specifically for a passkey-only Safe’s first UserOperation. Safe’s documentation explicitly identifies this limitation and workaround. [Safe passkey ERC-4337 documentation](https://github.com/safe-fndn/safe-modules/blob/main/modules/passkey/contracts/4337/README.md)

Current `permissionless.js` has WebAuthn-aware Safe construction using the shared signer, but this is version-sensitive. Its ordinary Safe examples still use ECDSA private-key owners. [permissionless.js source](https://github.com/pimlicolabs/permissionless.js)

**Fix**

Pin and document one exact combination:

- Safe `1.4.1`.
- EntryPoint `0.7`.
- Canonical `Safe4337Module`.
- `SafeWebAuthnSharedSigner` for initial deployment.
- Latest tested `permissionless.js` commit/version with WebAuthn Safe support.
- Exact Base Sepolia addresses loaded from `@safe-global/safe-modules-deployments`, not copied from blogs.
- `ox` installed for WebAuthn support.

Use `SafeWebAuthnSignerFactory` later when adding a second or recovered passkey owner, or predeploy the signer through a relayer before recovery.

Safe explicitly requires v1.4.1 or newer for the current 4337 module. [Safe ERC-4337 documentation](https://docs.safe.global/advanced/erc-4337/4337-safe)

---

### 5. High — “Recover to a new passkey” is missing a necessary on-chain step

Candide recovery changes the Safe’s owner addresses. A passkey public key is not itself an Ethereum address.

For a recovered passkey to become the new owner, the system must either:

- Deploy a `SafeWebAuthnSignerFactory` signer proxy for its P-256 public key and recover to that address; or
- Configure another shared-signer instance and set it as owner; or
- Temporarily recover to an EOA, then use that EOA to install the new passkey.

The last option introduces a temporary raw private key with full spending power and contradicts the intended custody model.

**Fix**

For the demo:

1. Create the new-device passkey.
2. Have a testnet relayer deploy its WebAuthn signer proxy.
3. Show the signer address to both recovery approvers.
4. Guardians sign recovery to that exact address.
5. Execute, wait, finalize.
6. Submit a transaction using the new passkey.

Do not hide this behind “swap executes.”

---

### 6. High — The phone-and-email threat claim is too categorical

A stolen phone does not necessarily require the victim’s biometric. WebAuthn user verification can use a PIN, password, pattern or biometric. FIDO describes passkeys as being unlocked by the device’s biometric, PIN, pattern or password. [FIDO passkey model](https://fidoalliance.org/passkeys-2/)

Passkeys may also be:

- Synced through iCloud, Google Password Manager or another credential provider.
- Device-bound.
- Exported or shared, depending on platform policy.

Apple’s consumer passkeys, for example, are normally synchronized using iCloud Keychain rather than necessarily being device-bound Secure Enclave keys. [Apple passkey overview](https://developer.apple.com/passkeys/)

Therefore an attacker with a phone and its unlock code may be able to sign directly. Phone and email may also expose:

- Swissquote’s banking app.
- SMS or push authentication.
- Recovery alerts.
- The platform account used to sync passkeys.

The plan is only correct under a narrower scenario:

> An attacker with a locked phone, no device PIN/biometric, no synced-passkey access, no recovery kit and no ability to pass Swissquote liveness cannot spend or recover.

**Fix**

Define separate threat cases:

- Phone possession only.
- Phone plus unlock PIN.
- Phone plus email.
- Compromised Apple/Google account.
- Malware in the browser/app.
- Bank account takeover.
- Recovery-kit theft.
- Swissquote insider/HSM compromise.
- Guardian collusion.

Require WebAuthn `userVerification: "required"` and verify the UV flag on-chain. Do not claim that UV proves a biometric was used; WebAuthn exposes successful user verification, not necessarily its modality. [W3C WebAuthn](https://www.w3.org/TR/webauthn-1/)

---

### 7. High — The recovery kit is underspecified and may be dangerously copyable

A “printed QR” presumably encodes an EOA private key or seed. If unencrypted:

- A photograph silently clones it.
- A printer, camera backup or cloud photo service may retain it.
- The owner cannot detect copying.
- Anyone possessing it can approve recovery together with Swissquote.

A “second-device passkey” has different problems:

- It may sync through the same platform account as the main passkey.
- It may not work as a Candide guardian without a deployed ERC-1271 signer.
- It can create a correlated failure rather than an independent factor.

**Fix**

Pick one concrete recovery factor:

- A fresh secp256k1 guardian key on a hardware security key or encrypted recovery card, with explicit backup instructions; or
- A second passkey represented by a separately deployed WebAuthn signer, using a different platform/security key.

For a printed card, encrypt it with a user-memorized recovery PIN using a memory-hard KDF, explain that copying remains a risk, and provide guardian rotation/revocation.

---

### 8. High — Passkey dependency creates operational and de facto control risks

WebAuthn credentials are scoped to an RP ID. Losing control of the Swissquote wallet domain, associated-domain configuration or application can prevent the credential from being exercised. [W3C RP-ID binding](https://www.w3.org/TR/webauthn-1/)

That means Swissquote might have no contract-level spending key while still controlling critical availability:

- The RP domain.
- The primary UI.
- Recovery service access.
- Guardian approval.
- Paymaster and bundler configuration.

If there is no trusted contact, passkey loss plus Swissquote shutdown makes recovery impossible because the kit alone cannot meet the 2-of-2 threshold.

**Fix**

Document:

- The permanent RP ID and domain continuity plan.
- An open-source recovery client that does not depend on Swissquote’s backend.
- A user-only recovery quorum such as kit + trusted contact.
- Direct RPC/bundler fallback instructions.
- How users rotate credentials before domain or platform migrations.

This is necessary to support the “full control” claim.

---

### 9. High — Recovery delay and Candide deployment details do not match the plan

Candide’s published recovery deployments/selectors use defined periods such as three minutes for testing and multiple-day production periods. The documented default is three days, not 48 hours. [Candide recovery SDK and grace periods](https://github.com/candidelabs/safe-recovery-service-sdk)

A custom two-minute or 48-hour deployment may use the same audited source, but it is:

- A separate contract address.
- Not necessarily the released canonical deployment.
- Outside the exact deployed artifact covered by ecosystem monitoring or bug-bounty assumptions.
- Another deployment task during the hackathon.

**Fix**

Use the canonical three-minute testing deployment for the demo and state:

> Production policy is expected to use 3–7 days after user research and risk review.

Do not market the whole composition as “bank-grade.” Say the individual contracts are audited; the integration and operational system are not.

---

### 10. High — The legal conclusions are inaccurate or too absolute

#### DLT Act and bankruptcy

The plan says segregation applies “only if the client keeps exclusive power of disposal.” That is not the rule in Article 242a DEBA.

Article 242a specifically addresses assets over which the bankrupt party has power of disposal. A surrender claim is supported where the provider undertook to keep the assets available and they are individually allocated to the customer, or the customer’s share of a pooled holding is clear. [DEBA Article 242a](https://ch.odat.ch/en/cc/281.1-20260101-en.html)

In genuine self-custody, the cleaner argument is that the assets are never held by Swissquote and should not enter its bankruptcy estate. That is different from claiming DLT Act segregation.

The recovery role complicates—but does not automatically defeat—the analysis:

- Swissquote has no unilateral disposal power.
- It participates in a quorum that can replace the owner.
- Whether this constitutes custody, joint power of disposal, or a regulated wallet service requires legal analysis of the complete technical and contractual arrangement.

FINMA describes non-custody providers as having neither legal nor actual disposal power, while custody wallet providers manage keys and have direct power of disposal. [FINMA wallet classification](https://www.finma.ch/en/documentation/dossier/dossier-fintech/entwicklungen-im-bereich-fintech/)

**Fix**

Replace the legal claim with:

> The intended design gives the client unilateral spending authority and gives Swissquote no unilateral transaction or recovery authority. Whether Swissquote’s guardian role affects the legal custody classification requires Swiss counsel and FINMA-facing analysis. Assets held in the self-custody Safe are not intended to be balance-sheet assets or deposits of Swissquote.

#### Travel Rule and wallet ownership

Creating an address for a KYC client and observing a passkey signature can be strong evidence of control, but it does not make the Travel Rule disappear.

FINMA requires suitable technical proof that an external wallet belongs to the bank’s customer. Third-party external wallets require identity, beneficial-owner and wallet-control checks. [FINMA Guidance 02/2019](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf?sc_lang=en)

Open questions include:

- Is an ERC-1271/passkey proof accepted and properly archived?
- What happens after social recovery changes the owner?
- Is the client also the beneficial owner?
- How are transfers involving third-party wallets handled?
- What payment information must still accompany transfers between regulated institutions?
- How are incoming transfers from arbitrary dApps classified and monitored?

**Fix**

Say:

> Wallet creation and a recorded EIP-1271 control challenge can automate much of Swissquote’s proof-of-control process for its own customer. Ownership must be re-attested after recovery or owner rotation, and Travel Rule and AML obligations remain transaction-dependent.

Add a “not legal advice; requires Swiss legal validation” qualifier.

---

### 11. Medium — WalletConnect and simulation are not plug-and-play

WalletConnect expects an EIP-1193-like wallet implementation that handles:

- Session namespaces and chain selection.
- `eth_sendTransaction`.
- `personal_sign` and typed-data requests.
- EIP-1271 semantics for a contract account.
- Request expiry, disconnects and unsupported methods.

A passkey Safe controlled through ERC-4337 is not automatically a WalletConnect wallet merely because `viem` is present.

Transaction simulation is similarly ambiguous. Simulating only the dApp call may miss:

- Safe module execution.
- Batched calls.
- ERC-20 approvals.
- Paymaster behavior.
- Account deployment.
- The final UserOperation gas and validation path.

**Fix**

For the hackathon, remove generic WalletConnect. Provide one pre-integrated dApp action with decoded calldata and a deterministic simulation result.

If WalletConnect is retained, treat it as a stretch goal after creation, transfer and recovery work end-to-end.

---

### 12. Medium — Important account-abstraction integration pitfalls are absent

Known risks include:

- Safe version, EntryPoint version and `Safe4337Module` address mismatch.
- Counterfactual address changing because of owner order, salt, threshold or setup-calldata changes.
- Incorrect WebAuthn dummy signature length causing L2 `preVerificationGas` underestimation.
- UserOperation expiry while the user is completing the passkey prompt.
- Paymaster policy or balance exhaustion.
- Bundler simulation accepting a different shape from the final signed operation.
- Safe transaction-service limitations around the shared WebAuthn signer.
- Incorrect Base Sepolia P-256 verifier configuration.
- Enabling the recovery module but failing to initialize guardians atomically.

Pimlico documents that inaccurate dummy signatures can cause `preVerificationGas is not enough`, especially on L2s. [permissionless.js FAQ](https://docs.pimlico.io/references/permissionless/faqs)

**Fix**

Maintain a tested deployment manifest containing chain ID, contract addresses, bytecode hashes, library versions, EntryPoint version, Safe salt and owner configuration. Smoke-test the exact UserOperation on Base Sepolia before building the rest of the UI.

## Coverage against judging criteria

### Technical implementation — Partial, high delivery risk

Covered conceptually:

- Creation.
- Authentication.
- Real transfer.
- Gas sponsorship.
- Recovery.

Missing or unresolved:

- Correct initial passkey signer.
- Deployment-before-funding.
- New-passkey deployment during recovery.
- Atomic recovery-module initialization.
- Exact package and contract versions.
- WalletConnect adapter.
- UserOperation-aware simulation.

### Security and custody design — Weak in current form

Positive:

- Swissquote lacks unilateral spending authority.
- Guardian threshold and delay are useful controls.
- Paymaster refusal does not freeze the account.

Missing:

- Explicit threat model.
- Device-PIN and synced-passkey compromise.
- Malicious frontend and malicious dApp cases.
- Bank insider/HSM compromise.
- Module compromise.
- Recovery-kit copying.
- Guardian replacement and loss.
- Swissquote/domain disappearance.
- Independent recovery alerts.
- Deployed versus undeployed account recovery.
- A precise explanation of joint recovery control.

### Legal feasibility — Materially overstated

The plan mentions relevant Swiss concepts but reaches conclusions that are not supported by the cited rules. It needs qualified language on custody classification, bankruptcy, AML/Travel Rule, beneficial ownership, outsourcing and re-verification after recovery.

It also omits privacy implications: public guardian addresses may link a customer, bank and trusted contact on-chain.

### Business case — Insufficient

“Paymaster fees, swaps and fewer tickets” is a hypothesis, not a business case.

Missing:

- Target customer segment.
- Expected activation and asset-retention uplift.
- Per-active-wallet bundler/paymaster cost.
- Recovery-support and fraud cost.
- Revenue assumptions.
- Liability allocation for failed or fraudulent recovery.
- Comparison with Swissquote custody, MetaMask, smart-wallet competitors and hardware wallets.
- Phased rollout and limits.

Charging “a small USDC fee” is also not automatically provided by a sponsored Pimlico paymaster. Pimlico distinguishes bank-funded verifying sponsorship from an ERC-20 paymaster where the user pays gas in tokens. [Pimlico paymaster models](https://docs.pimlico.io/guides/getting-started)

### UX and pitch — Happy path only

Missing UX includes:

- Unsupported device/browser.
- Passkey already exists.
- Synced versus device-bound explanation.
- User cancels biometric/PIN prompt.
- Paymaster unavailable.
- Bundler timeout and pending UserOperation.
- Counterfactual versus deployed status.
- Insufficient USDC.
- Recovery-kit setup and verification drill.
- Lost kit or trusted-contact replacement.
- Recovery already in progress.
- Wrong new-passkey fingerprint.
- Delay countdown and time zone.
- Recovery cancellation when the old phone is lost.
- Alternative-wallet/export path.
- Swissquote service shutdown.

## Bonus coverage

- **Gasless transactions:** Covered if a sponsored UserOperation is demonstrated. Do not mix this with an unimplemented USDC revenue fee.
- **Compliant dApp interaction:** Partial. A paymaster allowlist demonstrates compliant sponsorship, not transaction enforcement.
- **Recovery distinguishing a legitimate user from phone/email compromise:** Partial. The offline factor helps, but the phone/PIN, synchronized passkey and recovery-factor assumptions are not addressed.
- **Strong business case:** Not yet covered.
- **Swiss regulatory considerations:** Mentioned, but the central claims need correction.
- **Wallet ownership verification:** Promising, but must include a recorded challenge, EIP-1271 verification, owner-change re-attestation and qualified Travel Rule language.

## Feasible 36-hour scope

A defensible hackathon build would be:

1. Use a tested `permissionless.js` WebAuthn Safe path with `SafeWebAuthnSharedSigner`, Safe 1.4.1 and EntryPoint 0.7.
2. Deploy the Safe with a sponsored no-op before funding it.
3. Send one real Base Sepolia ERC-20 transfer through Pimlico.
4. Enable Candide recovery with two concrete guardians:
   - Mock Swissquote HSM EOA.
   - Offline recovery-card EOA.
5. Use the canonical three-minute testing grace period.
6. Create a new passkey, deploy its WebAuthn signer through a relayer, and recover to it.
7. Demonstrate cancellation from the old passkey.
8. Demonstrate one simulated, sponsored allowed transaction and one refused sponsorship.
9. Mock KYC, sanctions and fiat funding, clearly labelled.
10. Present the 2-of-3 trusted-contact design as production architecture, not as part of the live build.

Cut from the core demo:

- Generic WalletConnect.
- Tenderly/Alchemy dual integration.
- On-chain high-value policy.
- USDC fee collection.
- Custom recovery delays.
- Multiple recovery-factor types.
- Claims of automatic universal Travel Rule compliance.

## Recommended revised claim

A safer one-line description would be:

> A passkey-controlled Safe in which the client can transact unilaterally, while a delayed guardian quorum can replace a lost owner. Swissquote is one guardian and has neither unilateral spending nor unilateral recovery power; its sponsored transaction lane applies screening without preventing users from self-funding other transactions.

That remains compelling while accurately describing the custody and control boundaries.