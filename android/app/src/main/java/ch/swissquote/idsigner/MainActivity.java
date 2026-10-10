package ch.swissquote.idsigner;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.security.auth.callback.Callback;
import javax.security.auth.callback.CallbackHandler;
import javax.security.auth.callback.PasswordCallback;
import javax.security.auth.callback.UnsupportedCallbackException;

import org.json.JSONArray;
import org.json.JSONObject;

import es.gob.jmulticard.android.nfc.AndroidNfcConnection;
import es.gob.jmulticard.callback.CustomTextInputCallback;
import es.gob.jmulticard.card.AuthenticationModeLockedException;
import es.gob.jmulticard.card.BadPinException;
import es.gob.jmulticard.card.PrivateKeyReference;
import es.gob.jmulticard.card.dnie.DnieNfc;
import es.gob.jmulticard.card.icao.InvalidCanOrMrzException;
import es.gob.jmulticard.crypto.BcCryptoHelper;

/**
 * Signs a wallet request with the Spanish DNIe over NFC.
 *
 * The wallet web app opens sqid://sign?id=..&token=..&origin=.. . This activity fetches what is to be signed from
 * origin/api/dnie, asks for the card's CAN and PIN, and has the card sign the 32-byte request hash with its
 * qualified signature key ("CertFirmaDigital", RSA-2048, SHA256withRSA). It posts the signature and the card's
 * certificates back to origin/api/dnie. The private key never leaves the card; the PIN goes only to the card.
 */
public final class MainActivity extends Activity implements NfcAdapter.ReaderCallback {

    private static final String SIGN_ALIAS = "CertFirmaDigital";
    private static final String INTERMEDIATE_ALIAS = "CertCAIntermediaDGP";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private NfcAdapter nfc;
    private SharedPreferences prefs;
    private TextView title, origin, summary, hash, status;
    private EditText can, pin;
    private Button go;
    private View form, summaryCard;

    private String reqId, token, server;
    private byte[] toSign;
    private boolean reading;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        nfc = NfcAdapter.getDefaultAdapter(this);
        prefs = getSharedPreferences("signer", MODE_PRIVATE);
        title = findViewById(R.id.title);
        origin = findViewById(R.id.origin);
        summary = findViewById(R.id.summary);
        hash = findViewById(R.id.hash);
        status = findViewById(R.id.status);
        can = findViewById(R.id.can);
        pin = findViewById(R.id.pin);
        go = findViewById(R.id.go);
        form = findViewById(R.id.form);
        summaryCard = findViewById(R.id.summaryCard);
        can.setText(prefs.getString("can", ""));
        go.setOnClickListener(v -> startReading());
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopReading();
    }

    // ── Request ─────────────────────────────────────────────────────────────────────────────────────────────

    private void handle(Intent intent) {
        stopReading();
        Uri data = intent == null ? null : intent.getData();
        if (data == null || data.getQueryParameter("id") == null) {
            title.setText("Open this from your wallet");
            origin.setText("");
            summaryCard.setVisibility(View.GONE);
            form.setVisibility(View.GONE);
            status.setText("When the Swissquote wallet asks for your DNI, tap \"Open Swissquote ID\" there and this app takes over.");
            return;
        }
        reqId = data.getQueryParameter("id");
        token = data.getQueryParameter("token");
        server = data.getQueryParameter("origin");
        toSign = null;
        title.setText("Loading request…");
        origin.setText(server);
        summaryCard.setVisibility(View.GONE);
        form.setVisibility(View.GONE);
        status.setText("");
        if (nfc == null) {
            status.setText("This phone has no NFC reader, so it cannot read a DNI.");
            return;
        }
        io.execute(() -> {
            try {
                JSONObject r = new JSONObject(http("GET", server + "/api/dnie?id=" + Uri.encode(reqId) + "&token=" + Uri.encode(token), null));
                if (!r.isNull("error")) throw new Exception(r.getString("error"));
                StringBuilder lines = new StringBuilder();
                JSONArray arr = r.optJSONArray("lines");
                for (int i = 0; arr != null && i < arr.length(); i++) lines.append(i > 0 ? "\n" : "").append(arr.getString(i));
                String h = r.getString("hash");
                byte[] bytes = hex(h);
                ui.post(() -> {
                    toSign = bytes;
                    title.setText(r.optString("title", "Sign with your DNI"));
                    summary.setText(lines.toString());
                    hash.setText(h);
                    summaryCard.setVisibility(View.VISIBLE);
                    form.setVisibility(View.VISIBLE);
                    if (r.optBoolean("done")) done("Already signed. You can go back to your browser.");
                });
            } catch (Exception e) {
                ui.post(() -> {
                    title.setText("Request not available");
                    status.setText(message(e));
                });
            }
        });
    }

    // ── NFC ─────────────────────────────────────────────────────────────────────────────────────────────────

    private void startReading() {
        String c = can.getText().toString().trim();
        if (c.length() != 6) { status.setText("Enter the 6-digit CAN printed on the front of your DNI."); return; }
        if (pin.getText().length() < 8) { status.setText("Enter your DNI PIN (8 to 16 characters)."); return; }
        if (!nfc.isEnabled()) { status.setText("Turn on NFC in your phone settings, then try again."); return; }
        prefs.edit().putString("can", c).apply();
        ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(pin.getWindowToken(), 0);
        reading = true;
        go.setEnabled(false);
        status.setText("Hold your DNI flat against the back of the phone and keep it still…");
        Bundle opts = new Bundle();
        opts.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 1000);
        nfc.enableReaderMode(this, this, NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS, opts);
    }

    private void stopReading() {
        reading = false;
        if (nfc != null) nfc.disableReaderMode(this);
        if (go != null) go.setEnabled(true);
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        if (!reading || toSign == null) return;
        final String c = can.getText().toString().trim();
        final char[] p = pin.getText().toString().toCharArray();
        ui.post(() -> status.setText("Card found. Opening a secure channel with your CAN…"));
        try {
            DnieNfc dnie = new DnieNfc(new AndroidNfcConnection(tag), null, new BcCryptoHelper(), new Answers(c, p));
            ui.post(() -> status.setText("Signing on the card with your PIN…"));
            PrivateKeyReference key = dnie.getPrivateKey(SIGN_ALIAS);
            X509Certificate cert = dnie.getCertificate(SIGN_ALIAS);
            X509Certificate intermediate = dnie.getCertificate(INTERMEDIATE_ALIAS);
            if (key == null || cert == null) throw new Exception("This DNI has no signature certificate. Renew it at a police station update point.");
            byte[] sig = dnie.sign(toSign, "SHA256withRSA", key);
            ui.post(() -> { stopReading(); status.setText("Signed. Sending to your wallet…"); });

            JSONObject body = new JSONObject();
            body.put("action", "result");
            body.put("id", reqId);
            body.put("token", token);
            body.put("signature", "0x" + toHex(sig));
            body.put("certificate", Base64.encodeToString(cert.getEncoded(), Base64.NO_WRAP));
            if (intermediate != null) body.put("intermediate", Base64.encodeToString(intermediate.getEncoded(), Base64.NO_WRAP));
            JSONObject r = new JSONObject(http("POST", server + "/api/dnie", body.toString()));
            if (!r.isNull("error")) throw new Exception(r.getString("error"));
            ui.post(() -> done("Done. Go back to your browser: the wallet has your DNI signature."));
        } catch (BadPinException e) {
            fail("Wrong PIN. " + e.getRemainingRetries() + " attempts left before the card locks.");
        } catch (AuthenticationModeLockedException e) {
            fail("Your DNI PIN is locked. Unlock it at a police station update point (Punto de Actualización del DNIe).");
        } catch (InvalidCanOrMrzException e) {
            fail("The CAN does not match this card. Check the 6 digits on the front of your DNI.");
        } catch (Exception e) {
            fail(message(e));
        } finally {
            java.util.Arrays.fill(p, '\0');
        }
    }

    private void fail(String msg) {
        ui.post(() -> { stopReading(); status.setText(msg); });
    }

    private void done(String msg) {
        stopReading();
        form.setVisibility(View.GONE);
        pin.setText("");
        status.setText(msg);
    }

    /** Answers jmulticard's prompts: the CAN for the PACE channel, then the PIN. */
    private static final class Answers implements CallbackHandler {
        private final String can;
        private final char[] pin;

        Answers(String can, char[] pin) { this.can = can; this.pin = pin; }

        @Override
        public void handle(Callback[] callbacks) throws UnsupportedCallbackException {
            for (Callback cb : callbacks) {
                if (cb instanceof CustomTextInputCallback) ((CustomTextInputCallback) cb).setText(can);
                else if (cb instanceof PasswordCallback) ((PasswordCallback) cb).setPassword(pin);
                else if ("javax.security.auth.callback.TextInputCallback".equals(cb.getClass().getName())) {
                    try { cb.getClass().getMethod("setText", String.class).invoke(cb, can); }
                    catch (Exception e) { throw new UnsupportedCallbackException(cb); }
                } else throw new UnsupportedCallbackException(cb);
            }
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────

    private static String http(String method, String url, String json) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(10000);
        c.setReadTimeout(20000);
        if (json != null) {
            c.setDoOutput(true);
            c.setRequestProperty("content-type", "application/json");
            try (OutputStream os = c.getOutputStream()) { os.write(json.getBytes(StandardCharsets.UTF_8)); }
        }
        InputStream in = c.getResponseCode() >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        for (int n; in != null && (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        String s = out.toString("UTF-8");
        if (s.isEmpty()) throw new Exception("Empty response from " + url + " (HTTP " + c.getResponseCode() + ")");
        return s;
    }

    private static String message(Exception e) {
        String m = e.getMessage();
        if (e instanceof java.net.UnknownHostException || e instanceof java.net.ConnectException) return "Cannot reach the wallet server. Is this phone on the same network (or Tailscale)?";
        if (m == null || m.isEmpty()) return "Reading the card failed (" + e.getClass().getSimpleName() + "). Keep the card still and try again.";
        if (e.getClass().getName().contains("Apdu") || e.getClass().getName().contains("Lost") || e instanceof java.io.IOException) return "The card moved away. Keep it flat against the phone and try again.";
        return m;
    }

    private static byte[] hex(String h) {
        String s = h.startsWith("0x") ? h.substring(2) : h;
        byte[] out = new byte[s.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return out;
    }

    private static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
