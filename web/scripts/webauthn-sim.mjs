// Software WebAuthn authenticator for scripts: P-256 key, real authenticatorData/clientDataJSON format.
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { webauthnSignatureFromAssertion } from "abstractionkit";
const enc = new TextEncoder();
const b64url = (u8) => Buffer.from(u8).toString("base64url");
export function createSoftPasskey(rpId = "localhost", origin = "https://localhost") {
  const priv = p256.utils.randomSecretKey();
  const pub = p256.getPublicKey(priv, false);
  const x = BigInt("0x" + Buffer.from(pub.slice(1, 33)).toString("hex"));
  const y = BigInt("0x" + Buffer.from(pub.slice(33, 65)).toString("hex"));
  let counter = 0;
  async function getAssertion(challenge) {
    const rpIdHash = sha256(enc.encode(rpId));
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0); authData[32] = 0x05; // UP | UV
    new DataView(authData.buffer).setUint32(33, ++counter);
    const clientDataJSON = enc.encode(JSON.stringify({ type: "webauthn.get", challenge: b64url(challenge), origin, crossOrigin: false }));
    const msg = new Uint8Array([...authData, ...sha256(clientDataJSON)]);
    const sig = p256.sign(sha256(msg), priv, { prehash: false, lowS: true, format: "compact" });
    const r = BigInt("0x" + Buffer.from(sig.slice(0, 32)).toString("hex"));
    const s = BigInt("0x" + Buffer.from(sig.slice(32, 64)).toString("hex"));
    return webauthnSignatureFromAssertion({ authenticatorData: authData, clientDataJSON, signature: { r, s } });
  }
  return { publicKey: { x, y }, getAssertion };
}
