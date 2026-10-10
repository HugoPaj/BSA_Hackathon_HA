# Adversarial review of PLAN.md (Swissquote self-custody wallet)

Reviewer stance: assume the plan is wrong until shown otherwise. Facts marked **[verified]** were checked against current vendor docs or primary legal sources on 2026-10-10; everything else is reasoning.

## Verdict in three lines

- The product idea (passkey-signed Safe, Swissquote as a non-spending recovery guardian with a user veto) is the right shape and pitches well.
- The stack as written does not exist off the shelf: **permissionless.js does not support passkeys with Safe** (it says so in Pimlico's own docs), the Safe passkey flow puts a *shared* signer as owner that Candide's recovery module cannot re-key, and the "48h delay" is not a deployable Candide option. Fixable, but only if you change the stack in hour 1, not hour 30.
- The headline security claim ("attacker with phone + email cannot sign") is false for the most common real-world attack (phone + passcode), and the veto mechanism is useless in exactly the two cases it is supposed to cover. The legal section mixes up custody-side segregation law with a non-custodial product; the Travel Rule / ownership-verification claim is essentially right but mislabeled.

---

## 1. Security and custody holes in the recovery design

### S1. "Attacker with the victim's phone + email cannot sign" is false for the realistic attacker  — **CRITICAL (as a claim), HIGH (as a design gap)**

- The plan treats "passkey demands biometrics" as the barrier. On iOS and Android, the device passcode is a full fallback for biometrics, and a passcode holder can enrol their own face/finger. The documented iPhone-theft pattern is shoulder-surf passcode, then steal phone. That attacker signs anything the passkey can sign. **[verified: Apple's own threat-model note: "If an attacker knows the device passcode... performing biometrics doesn't provide additional protection."]**
- There is nothing in the design that limits damage once the spending key is compromised: no spending limit, no cool-down for large transfers, no second owner for high value, no "freeze". Recovery does not help here: the attacker *is* the current owner and can also **cancel any recovery the victim starts** (Candide `cancelRecovery` is owner-only), while draining funds.
- Consequence for judging: "recovery that distinguishes legit user from attacker with compromised phone/email" is the bonus; the judges will ask precisely this question.

Fix:
1. State the honest threat model: "an unlocked phone with passcode = compromised spending key; recovery cannot fix that, limits can."
2. Add a cheap on-chain limit: a second Safe owner for high value is not possible with one global threshold, so instead put the limit in the paymaster/backend path for the demo and *say* that production uses a Safe Guard or a spending-limit module (Safe Allowance module exists and is audited). Do not claim this is enforced on-chain unless you deploy it.
3. Reword all "cannot sign" claims to "cannot sign without the device passcode or biometrics".

### S2. Veto requires the current passkey, so it fails in both target cases — **HIGH**

- Loss case: victim lost the passkey, so victim cannot veto anything. Only guardians' honesty + delay protects them.
- Compromise case: attacker holds the passkey, so the attacker can veto the legitimate user's recovery forever (and drain).
- Alerts (push/email/in-app) go to the attacker's phone in the compromise case, by construction.
- The demo script ("Replay as attacker and veto from old device") only works in the *third* scenario: guardians acting maliciously while the user still has the phone. That is a valid scenario (guardian collusion / Swissquote insider) but it is not the one advertised.

Fix: reframe the veto as a defence against **guardian collusion and insider abuse**, not against phone thieves. Add a guardian-side brake: in Candide's module v0.2.0, any guardian-set change by the owner cancels pending recoveries, but guardians themselves cannot freeze. If you want "any guardian can pause", say it is a production extension (a Guard that blocks `execTransaction` while a recovery is pending would do it) and do not demo it.

### S3. Swissquote + trusted contact = 2-of-3 can rotate the owner without any user-held factor — **HIGH**

- With guardians {Swissquote, kit, contact} and threshold 2, Swissquote plus one social-engineered contact (or a Swissquote insider plus a phished contact) can replace the owner after the delay. The plan's "it can never rotate the owner alone" is literally true and practically weak: "alone" is one phishing call away.
- Kit + contact also works without Swissquote, which deletes the "bank behind recovery" assurance for a thief who finds the paper kit and knows the contact.

Fix (pick one, state it explicitly):
- Make the user-held factor mandatory: guardian A = a 1-of-2 Safe {Swissquote, contact} (contract guardians via EIP-1271 are supported in Candide v0.2.0 **[verified in the v0.2.0 PR: "Relayed EIP-1271 signatures from Safe guardians are now accepted"]**), guardian B = kit, threshold 2. Then the kit is always required and Swissquote or the contact fills the second slot. Kit loss while the passkey still works is handled by rotating guardians (owner tx).
- Or keep 2-of-3 but say plainly: "we accept that Swissquote + contact can recover; that is the legitimate 'house fire' path, and the 3-day delay plus multi-channel alert is the control."

### S4. Synced passkeys break the "secure enclave" story and change the loss model — **MEDIUM**

- Apple and Google passkeys are synced (iCloud Keychain / Google Password Manager). The private key is E2E-encrypted and restorable on any device that passes Apple ID/Google auth plus a trusted-device passcode or escrow recovery. So: (a) "stored in the phone's secure enclave" is not accurate; (b) the Apple/Google account is now part of the trusted computing base, and "phone + email" attackers who can reset the Apple ID (email is often the recovery channel) can restore the passkey elsewhere; (c) losing the phone usually does *not* lose the passkey, so the recovery flow is really for "lost account/all devices", which is rarer than the pitch implies.
- Safari on iOS does not let a web app create a device-bound (non-synced) passkey; device-bound requires a hardware key or a native app with attestation.

Fix: describe the key as "device-protected, cloud-synced passkey; iCloud/Google account is part of the threat model; high-value tier uses a device-bound key (YubiKey or second-device passkey)". Turn this into a feature: "losing the phone is not a loss event; losing the account is, and we handle both."

### S5. Recovery kit threats — **MEDIUM**

- A printed QR holding an EOA private key is as sensitive as a seed phrase. The plan says "no seed phrase is ever shown" and then prints one. Be honest about it.
- Whoever controls the phone at setup time (malware, abusive partner) also has the kit image unless the kit is generated on a second device or shown once and never stored.
- Kit + a colluding contact bypasses Swissquote entirely (see S3).

Fix: default guardian B to a passkey on a second device (laptop) and offer paper only as a fallback. If paper, show it once, never store it, and require re-pass of Swissquote login before it is shown.

### S6. Swissquote insider and KYC-liveness bypass — **MEDIUM**

- The Swissquote guardian key (HSM) is operated by people. Deepfake-liveness fraud against bank re-verification is a current, known attack. Insider + stolen kit = takeover; insider + contact = takeover (S3).
- Nothing prevents the Swissquote guardian from co-signing *two* competing recoveries or from approving a recovery while another is pending.

Fix: policy around the guardian key: refuse to sign if a recovery is already pending, enforce a 24h cool-off after any login credential change, require two Swissquote operators (4-eyes) for the HSM signature, notify every registered channel including e-banking inbox and postal letter for high balances. Mock these as explicit states in the backend; they are cheap and judges love "4-eyes".

### S7. Recovery delay and liveness dependence — **LOW/MEDIUM**

- "48h" is not an available Candide deployment: production modules are fixed at 3, 7 or 14 days; a 3-minute module exists on testnets only (Base Sepolia included). **[verified: Candide deployments page]** Say "3 days" or self-deploy with a custom constructor value (the repo has deterministic deploy scripts) and accept that it is then not the audited canonical address.
- Without guardian C, a user who loses the passkey and whom Swissquote refuses (frozen account, compliance hold, bank outage) is locked out forever. That is a form of control. Say so and recommend C.

### S8. Wording that will be challenged — **LOW**

- "No party holds a full key except the user": Swissquote holds a full guardian key. Rephrase: "no party other than the user holds a key that can move funds."
- "Compliance without seizing control": true only if the self-pay-gas path really exists in the app (see L4).

---

## 2. Technical feasibility in ~36 hours

### T1. permissionless.js does not support passkeys with Safe — **CRITICAL (blocks the stack as written)**

- Pimlico's passkey guide: "Currently, `permissionless` supports passkeys only with kernel accounts." `toSafeSmartAccount` `owners` is typed `[LocalAccount | EIP1193Provider | WalletClient]`; no WebAuthn account. **[verified: docs.pimlico.io passkey-server guide and toSafeSmartAccount reference]**
- Hand-rolling it means building the Safe contract-signature encoding (r = signer address, s = offset, v = 0, dynamic WebAuthn bytes, prefixed by the 4337 module's validAfter/validUntil) and a custom `toSmartAccount`. Doable by someone who has done it before; a bad use of hackathon hours otherwise.

Fix (choose by hour 2):
- **Option A (recommended): Candide abstractionkit** `SafeAccountV0_3_0` with a `WebauthnPublicKey` owner, their `SocialRecoveryModule` helpers, and the Candide bundler/paymaster. Base Sepolia (84532) is in their supported list and their Safe-passkey and recovery contracts are deployed there. One vendor built exactly this combination. Keep Pimlico only if you need its sponsorship-policy webhook for the compliance demo (abstractionkit accepts a generic bundler URL; test early).
- **Option B: Safe{Core} SDK `Safe4337Pack` + Pimlico** for passkey signing (documented React tutorial, Sepolia). Recovery then means raw viem calls into Candide's module. Works, but see T2.
- Keep permissionless.js only if you switch to Kernel (then you lose the Safe pitch and Candide's module).

### T2. Safe passkey owner is the *shared* signer; Candide recovery cannot re-key it — **HIGH**

- When a Safe is deployed via 4337 with a passkey (Safe4337Pack, and abstractionkit's initializer too), the Safe owner is the `SafeWebAuthnSharedSigner` singleton address and the P-256 public key lives in the Safe's own storage, set by a delegatecall `configure` during `setup`. "Because the shared signer is a single contract address, it can only ever represent a single passkey owner for Safe." **[verified: safe-modules passkey 4337 README; safe-core-sdk issue #862]**
- Candide's module finalizes recovery by calling `swapOwner`/`addOwner` on the Safe. It cannot delegatecall `configure`, so "install new passkey into shared signer" is impossible via recovery.
- Therefore recovery must swap the shared-signer owner for a **per-key `SafeWebAuthnSignerProxy`** created by `SafeWebAuthnSignerFactory.createSigner(x, y, verifiers)` (anyone can deploy it, deterministic address). After that, the SDK must sign for a factory-signer owner, not the shared signer. abstractionkit's `createSwapOwnerMetaTransactions` already supports swapping to a `WebauthnPublicKey` (deploys the proxy if needed); replicate the same two steps in recovery: (1) deploy the proxy, (2) `finalizeRecovery` with `newOwners = [proxyAddress]`.
- The post-recovery signing path (factory signer as owner) is a different code path from the pre-recovery one (shared signer). Test it in hour 3, not in the final demo.

### T3. Candide module specifics that bite — **MEDIUM**

- Grace period is a constructor constant per deployment: 3d / 7d / 14d in production, 3 minutes on Sepolia/Base Sepolia/OP Sepolia/Arb Sepolia. Use the 3-minute module (`0x949d...8c66`) for the demo; the plan's "2 minutes" becomes 3. **[verified]**
- v0.2.0 (Certora fixes) changed the ABI: confirmation functions take an explicit `nonce`, `encodeRecoveryData` renamed, EIP-712 domain version bumped, guardian-set changes auto-cancel pending recoveries. Make sure the SDK version matches the module address you use, or your guardian signatures will not verify. **[verified: candide-contracts PR #28]**
- `addGuardianWithThreshold` must be called by the Safe itself. With a counterfactual Safe, either (a) batch `enableModule` + guardian setup in the first sponsored UserOp via MultiSend, or (b) put it in `setupTransactions`/initializer. (b) runs inside `initCode`; the module writes to storage keyed by the Safe address, which ERC-7562 counts as sender-associated, but bundlers differ in strictness. Try (b), fall back to (a).
- Guardian signatures are EIP-712 over (module domain, chainId, Safe, new owners, threshold, nonce). The Swissquote "HSM" and the kit sign off-chain; any relayer submits `multiConfirmRecovery` + `executeRecovery`; `finalizeRecovery` is permissionless. Guardians never need gas. Good for the demo; say it.

### T4. Paymaster policy enforcement is realistic, the "Swissquote fee" is not as written — **MEDIUM**

- Pimlico sponsorship policies support a webhook that returns `{ "sponsor": true|false }` per UserOp, with the full UserOp in the request. **[verified]** So "paymaster refuses blocked tx" is real, and an even simpler route is to gate the call to `pm_sponsorUserOperation` in your own backend (the API key is server-side anyway).
- "Swissquote takes a small USDC fee" via the paymaster: Pimlico's ERC-20 paymaster sends the fee to Pimlico, not to Swissquote. Implement the fee as a second call in the batched UserOp (`transfer(recipient)`, `transfer(swissquoteFeeWallet)`). Trivial, and visible on the explorer.

### T5. WalletConnect + simulation + sanctions in 36h — **MEDIUM/HIGH risk, low score impact**

- Wallet-side WalletConnect (WalletKit) integration — pairing, session proposal, namespace negotiation, `eth_sendTransaction` / `personal_sign` handling with EIP-1271 for a contract account — is easily half a day alone and fails in demos (QR scanning, session expiry).
- Alchemy asset-change simulation is mainnet-focused; Tenderly supports Base Sepolia but needs an account and an API key. A `simulateContract`/`eth_call` plus decoded Transfer logs is enough to show "you will send 100 USDC to X".

Fix: replace WalletConnect with an in-app "dApp panel" that calls a real testnet contract (e.g. a USDC approve + a swap-like contract you deploy) through the same allowlist -> simulation -> sanctions -> paymaster pipeline. Same bonus, a tenth of the risk. Mention WalletConnect as the production transport.

### T6. "Require recovery kit as second confirmation above a threshold" is not implementable as described — **MEDIUM**

- The kit is a recovery *guardian*, not a Safe *owner*. Safe has one global threshold; a guardian cannot co-sign a transaction. Per-value co-signing needs a Guard, a spending-limit module, or a second owner with threshold 2 (which then applies to every tx).

Fix: enforce the high-value check off-chain in the paymaster policy (backend asks for an extra kit-signed approval before sponsoring) and say on-chain enforcement is a production Guard. Do not claim it is on-chain.

### T7. Passkey/demo environment pitfalls — **MEDIUM**

- Passkeys are bound to the RP ID (domain). `localhost` on device 1 and a laptop on device 2 are different origins; "recover on second device" needs one HTTPS domain (Vercel preview is fine).
- Chrome on Linux has no platform authenticator by default; you need a YubiKey, an Android phone via hybrid (QR), or the DevTools "virtual authenticator". Decide the demo hardware now.
- "Kill first browser profile" does not delete a synced passkey (Google Password Manager / iCloud). For the loss demo, either use the virtual authenticator (truly ephemeral) or a YubiKey you physically put away.

### T8. Things that are fine

- Base Sepolia has the RIP-7212 P-256 precompile (OP-Stack); Safe's verifier config uses precompile + fallback. Passkey verification costs ~3.5k gas instead of ~300k. Non-issue.
- Safe v1.4.1 + Safe4337Module + Candide module coexist as independent modules; no conflicts.
- Pimlico and Candide both run bundler + paymaster on Base Sepolia; testnet USDC exists (Circle faucet).

---

## 3. Judged-point coverage: covered vs. hand-waved

| Point | Status | Comment |
|---|---|---|
| Create | Covered | Fine. Make deployment happen at creation (sponsored UserOp with module + guardian setup), not lazily at first transfer, or recovery is unconfigured for new users. |
| Authenticate | Covered | Passkey ceremony is the auth. Say explicitly: "auth before signing = WebAuthn user verification; no session keys." |
| Sign real tx | Covered | USDC transfer on Base Sepolia via bundler. Show the explorer link. |
| Loss of access | Hand-waved | Depends on T7 (synced passkeys do not die with a profile). Define the loss event precisely. |
| Recovery | At risk | Depends on T1/T2 being solved; demo delay = 3 min module. |
| Custody model | Covered | Good, but tighten wording (S8). |
| Threat model | Weak | No attacker matrix. Write a 6-row table: phone locked / phone + passcode / email / kit / contact / Swissquote insider / Apple ID, each vs. sign, recover, veto. Most of the security score lives here. |
| Architecture | Partially | Needs a one-page diagram with the four trust zones: device, Swissquote backend (guardian + paymaster policy), chain (Safe + modules), third parties (bundler, sanctions API). |
| Key locations | Covered | Add the Apple/Google sync cloud as a key location. |
| Gasless (bonus) | Covered | Fix the fee mechanics (T4). |
| Compliant dApp (bonus) | Hand-waved | WalletConnect + Tenderly + sanctions in 36h is a stretch; see T5. |
| Attacker-distinguishing recovery (bonus) | Hand-waved | Current design does not distinguish; it relies on Swissquote KYC. Say so, and show the attacker *failing the Swissquote liveness* as the distinguishing step. |
| Business case (bonus) | Thin | Numbers absent. Add: current Swissquote crypto AUM share, withdrawal-ticket cost estimate, paymaster fee take (e.g. 0.1% + 0.05 USDC), DeFi yield referral. Even rough numbers beat none. |
| Swiss regulation (bonus) | Partly wrong | See section 4. |

---

## 4. Legal claims

### L1. DLT Act / segregation / "not a deposit" is the wrong frame — **HIGH (credibility with the legal judge)**

- Art. 242a DEBA (and Art. 16 no. 1bis BankA for banks) grants segregation in a *custodian's* bankruptcy if the custodian (i) has the actual power of disposal over the crypto assets and (ii) was obliged to keep them available for the client at all times, and the assets are individually or clearly attributed. **[verified: Caplaw analysis of the DLT law; FINMA Guidance 01/2026 restates: segregable only if "held in readiness for customers at all times" and individually or clearly attributably held]**
- "Exclusive power of disposal" in the DLT-law debate refers to the *custodian's* exclusive key control as a prerequisite for 242a, not to the client. The plan inverts it.
- In the proposed design, Swissquote never has power of disposal, so neither 242a nor the deposit question (Art. 5a BankO) arises. The correct pitch is: "self-custody means the assets never enter Swissquote's custody: no bankruptcy exposure, no custody-asset accounting, no operational-risk capital add-on for custody; compare with FINMA Guidance 01/2026 (12 Jan 2026) which tightens expectations for custodial setups."
- The real legal question is the **opposite** one: does the guardian role (plus the paymaster allowlist) give Swissquote "power of disposal" so that the wallet is custodial, triggering AMLA financial-intermediary duties for every on-chain transfer? FINMA's practice: non-custody wallet providers "have neither a legal nor actual power of disposal over the third-party assets" and are not subject to AMLA; a wallet is only non-custodial if the provider "is not able to influence transactions from a commercial or legal point of view" (case-by-case). Secondary sources state multi-sig providers whose signature is required to *execute* a transaction do have power of disposal. **[verified: FINMA "Developments in FinTech" page; MME article]** Swissquote's guardian key cannot execute or sign transactions and cannot rotate ownership alone or without delay: that is the argument, and it should be stated as the design's purpose. This is the single legal point on which the whole product stands.

### L2. FINMA 02/2019 wallet-ownership claim: substantively right, mislabeled — **MEDIUM**

Verbatim from FINMA Guidance 02/2019 (p. 3): "As long as an institution supervised by FINMA is not able to send and receive the information required in payment transactions, such transactions are only permitted from and to external wallets if these belong to one of the institution's own customers. Their ownership of the external wallet must be proven using suitable technical means. [...] A transfer from or to an external wallet belonging to a third party is only possible if, as for a client relationship, the supervised institution has first verified the identity of the third party, established the identity of the beneficial owner and proven the third party's ownership of the external wallet using suitable technical means." **[verified: FINMA PDF]**

- So: Swissquote -> client's self-custody Safe is a transfer to the client's own external wallet and needs ownership proof. Because Swissquote itself derived and deployed the Safe for a KYC'd client and the client signs with the passkey, proof is automatic. That claim is sound and is the strongest regulatory selling point. Industry accepted means include a signed message (EIP-1271 works for a contract account) and the micro-transaction/time-boxed deposit test.
- But it is not a "Travel Rule transfer": ownership verification is the rule that applies precisely *when* Travel Rule data cannot be exchanged. The Travel Rule proper is Art. 10 AMLO-FINMA (threshold CHF 1,000 since 2020). Fix the label.
- FINMA is stricter than FATF: there is no unhosted-wallet exemption. Transfers from Swissquote to *third-party* unhosted wallets require full onboarding of the third party. This cuts both ways for the pitch: it is a reason clients want a bank-adjacent self-custody wallet (Swissquote can fund it), and it is why the non-custodial classification in L1 matters: if Swissquote were deemed to have power of disposal, every dApp interaction from the wallet would be a Swissquote payment to a third-party external wallet, which 02/2019 forbids.

### L3. Sanctions screening and gas sponsorship — **LOW**

- Sponsoring gas for a transfer to a sanctioned address is itself a service to that transaction. The paymaster allowlist is therefore not only a "bonus" but a reasonable control for Swissquote's own exposure. Say that.

### L4. "User can still pay gas themselves" must be real, not a footnote — **MEDIUM**

- The non-custodial argument (L1) relies on Swissquote not being "able to influence transactions". If the app offers no self-pay path and the server-side allowlist blocks the UI, a regulator could view the allowlist as control. Keep a documented self-pay path (even if only in the architecture doc for the demo) and show the blocked state as "not sponsored", not "forbidden".

### L5. Minor

- Swissquote is a bank; the guardian service is probably an ancillary service with contractual terms. Mention that the terms must not give Swissquote any right to initiate recovery on its own or to withhold recovery arbitrarily (otherwise "legal power of disposal" arguments appear).
- Don't say "DLT Act proves ... on-chain". A statute proves nothing on-chain; the on-chain design is what keeps the statute inapplicable.

---

## 5. UX gaps in the demo flow

1. **Scenario order contradiction.** The plan kills the first browser profile and later vetoes from the "old device". Order the demo: create -> fund -> sign -> attacker tries to sign (fails) -> attacker starts recovery (fails at Swissquote liveness; or if you show a colluding-guardian attempt, user vetoes from the live device) -> *then* real loss -> recovery on device 2 -> sign from device 2.
2. **Single HTTPS origin** for both devices (T7). Decide hardware: phone + laptop, or laptop + YubiKey.
3. **Kit onboarding moment.** Nobody prints a QR during a one-tap flow. Make the default guardian B a second-device passkey ("add your laptop"), and gate the paper kit behind "before first deposit over CHF X". Show it as a checklist in a Security Center.
4. **Pending-recovery state** must be loud: a banner with a countdown, who requested it, which guardians approved, and a one-tap "This wasn't me" that calls `cancelRecovery` and rotates guardians.
5. **Transaction sheet** should show: recipient label/allowlist status, simulated balance change, sanctions status, fee in USDC, "sponsored by Swissquote" badge. Blocked state: "Swissquote will not sponsor this transaction", with the self-pay path documented.
6. **Funding** from the mocked Swissquote account needs a pre-funded testnet USDC hot wallet and a visible "wallet ownership verified automatically" line, because that is the regulatory bonus made visible.
7. **Attacker persona** must be explicit on screen ("Has: phone (locked), email. Lacks: passcode, face, kit."). Otherwise the judges will fill in their own attacker, and S1 applies.
8. **Delay messaging**: demo at 3 minutes, show "3 days in production" in the UI copy to pre-empt the question.
9. **Guardian C consent** needs a flow (contact accepts the role from their own device). Mock it as a link, but show it.

---

## 6. Simpler alternatives with the same coverage

1. **Candide end-to-end** (Safe 1.4.1 + Safe4337Module + Safe passkey + SocialRecoveryModule + Candide bundler/paymaster on Base Sepolia). One SDK, one vendor, all pieces built to work together, 3-minute recovery module on Base Sepolia. Keeps the "Safe, audited, bank-grade" story and the Candide module pitch. Lowest integration risk by far. Pimlico can remain in the slide as the production paymaster.
2. **Safe4337Pack + Pimlico** for signing (documented tutorial) plus raw viem for the Candide module. Second choice; the shared-signer swap (T2) is your main risk.
3. **ZeroDev Kernel + passkey validator + guardian recovery**: fully supported by permissionless.js and documented, but ZeroDev recovery has no delay/veto, and the "Safe" credibility point goes away. Only as a last-resort fallback for the signing demo.
4. **Drop WalletConnect**; in-app dApp panel through the same compliance pipeline (T5).
5. **Drop on-chain high-value co-signing**; enforce in the paymaster policy and state the production Guard (T6).
6. **Simplify guardians for the demo**: Swissquote + kit (2-of-2) with contact C as a documented option. Fewer moving parts, and it removes the S3 collusion story from the demo (but describe it in the threat model).
7. **Deploy at creation** with a single sponsored UserOp that enables the recovery module and sets guardians; no counterfactual tricks needed.

---

## Top 5 changes to make

1. **Switch the SDK now.** permissionless.js has no Safe passkey support. Use Candide abstractionkit (Safe + passkey + SocialRecoveryModule + paymaster, all on Base Sepolia); keep Pimlico only for the sponsorship-webhook demo if you want it. Prove "create -> sign -> recover to a new passkey -> sign again" end to end by hour 6.
2. **Design recovery around the shared-signer limitation.** Recovery must deploy a per-key `SafeWebAuthnSignerProxy` via the factory and `swapOwner` to it; the post-recovery signing path is different code. Use the 3-minute module on Base Sepolia and say "3 days" (not 48h) for production.
3. **Rewrite the threat model honestly.** Add the attacker matrix (phone locked / phone + passcode / email / Apple-Google account / kit / contact / insider) and admit that a passcode-holding attacker can spend; mitigate with limits, not recovery. Reframe the veto as a defence against guardian collusion and insiders. Fix S3 by making the user-held factor mandatory or stating the collusion trade-off.
4. **Fix the legal section.** Drop the 242a/deposit framing (it is custody law and does not apply to self-custody); argue instead that Swissquote stays below "power of disposal" and why that matters under FINMA 02/2019 (no unhosted-wallet exemption; ownership verification for transfers to own clients' external wallets; Travel Rule CHF 1,000). Quote the guidance; it reads well.
5. **De-risk the bonuses.** Replace WalletConnect with an in-app dApp panel, move the high-value second confirmation to the paymaster policy, implement the Swissquote fee as a batched USDC transfer, and pre-decide the demo hardware and a single HTTPS origin for the two-device recovery demo.
