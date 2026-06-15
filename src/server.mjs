import http from 'http';
import { doLogin } from './login.mjs';
import { doVerify } from './verify.mjs';
import { doResend } from './resend.mjs';
import { doDownloadDocument } from './download_document.mjs';
import { doEmailDocument } from './email_document.mjs';

const PORT = process.env.PORT || 8080;

// The Playwright page object returned by doLogin().
// Null until /login completes; used by /verify to reach the already-open browser.
let activePage = null;

// True while doLogin() is running. Prevents concurrent Chrome launches.
let loginInProgress = false;

// Path and filename of the most recently downloaded document, set by /download_document.
let lastDownload = null; // { savePath, filename }

// Reads the full request body and parses it as JSON.
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve(body); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Only POST requests are supported
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const payload = await readBody(req);

  // ── POST /login ─────────────────────────────────────────────────────────────
  // Calls doLogin() which opens Chrome, navigates to the login page, fills in
  // the ID and phone number, and submits the first form.
  // Returns immediately — doLogin() runs in the background and stores the page
  // in activePage once it's done so /verify can use it.
  if (req.url === '/login') {
    console.log('[/login] payload:', JSON.stringify(payload, null, 2));

    const { idNumber, phoneNumber } = payload;
    if (!idNumber || !phoneNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'idNumber and phoneNumber are required' }));
      return;
    }

    if (loginInProgress) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'login already in progress — wait for it to complete' }));
      return;
    }

    // Fire doLogin in the background so the HTTP response is returned immediately.
    // When doLogin finishes, it gives us back the Playwright page that is now
    // sitting on the OTP screen, ready for /verify.
    loginInProgress = true;
    doLogin(idNumber, phoneNumber)
      .then(page => {
        activePage = page;
        loginInProgress = false;
        console.log('[/login] Credentials submitted. OTP page is ready.');
      })
      .catch(err => {
        console.error('[/login] Error:', err);
        activePage = null;
        loginInProgress = false;
      });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  // ── POST /verify ────────────────────────────────────────────────────────────
  // Calls doVerify() which types the OTP into the open browser page and submits
  // the second form. Saves screenshots and a DOM snapshot to /app/ afterwards.
  if (req.url === '/verify') {
    console.log('[/verify] payload:', JSON.stringify(payload, null, 2));

    const otp = payload.otp ? String(payload.otp) : null;
    if (!otp) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'otp is required' }));
      return;
    }
    // Guard: /login must have been called first and must have completed
    if (!activePage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /login first' }));
      return;
    }

    // Await doVerify so the HTTP response is only sent after the OTP has been
    // submitted and the page has navigated to the authenticated area. This prevents
    // a race condition where the caller (e.g. n8n) immediately fires /download_document
    // before the session is actually authenticated.
    try {
      await doVerify(activePage, otp);
      console.log('[/verify] OTP submitted successfully.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'verified' }));
    } catch (err) {
      console.error('[/verify] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── POST /resend ─────────────────────────────────────────────────────────────
  // Clicks the "resend OTP" link on the open OTP screen. Useful when the first
  // SMS didn't arrive. Requires /login to have completed first.
  if (req.url === '/resend') {
    console.log('[/resend] request received');

    if (!activePage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /login first' }));
      return;
    }

    doResend(activePage)
      .then(result => console.log(`[/resend] result: ${result}`))
      .catch(err => console.error('[/resend] Error:', err));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  // ── POST /download_document ──────────────────────────────────────────────────
  // Navigates to the trade forms page, expands הצהרת תושבות, clicks
  // "לחץ להורדת הטופס", and streams the downloaded PDF back in the response.
  if (req.url === '/download_document') {
    console.log('[/download_document] request received');

    if (!activePage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /login and /verify first' }));
      return;
    }

    try {
      const { buffer, filename, savePath } = await doDownloadDocument(activePage);
      lastDownload = { savePath, filename };
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (err) {
      console.error('[/download_document] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── POST /verify_and_deliver ──────────────────────────────────────────────────
  // Composite endpoint: verifies the OTP, downloads the residency declaration,
  // and emails it — all in one call. Replaces the three-step /verify →
  // /download_document → /email_document sequence for the common happy path.
  if (req.url === '/verify_and_deliver') {
    console.log('[/verify_and_deliver] payload:', JSON.stringify(payload, null, 2));

    const otp = payload.otp ? String(payload.otp) : null;
    if (!otp) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'otp is required' }));
      return;
    }
    if (!activePage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /login first' }));
      return;
    }

    try {
      await doVerify(activePage, otp);
      console.log('[/verify_and_deliver] OTP verified, downloading document...');
      const { savePath, filename } = await doDownloadDocument(activePage);
      lastDownload = { savePath, filename };
      console.log('[/verify_and_deliver] Document downloaded, emailing...');
      await doEmailDocument(savePath, filename);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'delivered', filename, to: 'israelkariti@gmail.com' }));
    } catch (err) {
      console.error('[/verify_and_deliver] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── POST /email_document ─────────────────────────────────────────────────────
  // Emails the most recently downloaded document to israelkariti@gmail.com.
  // Requires /download_document to have been called first.
  // Requires GMAIL_USER and GMAIL_APP_PASSWORD environment variables to be set.
  if (req.url === '/email_document') {
    console.log('[/email_document] request received');

    if (!lastDownload) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no document available — call /download_document first' }));
      return;
    }

    try {
      await doEmailDocument(lastDownload.savePath, lastDownload.filename);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'sent', filename: lastDownload.filename, to: 'israelkariti@gmail.com' }));
    } catch (err) {
      console.error('[/email_document] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
