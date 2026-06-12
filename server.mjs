import http from 'http';
import { doLogin } from './login.mjs';
import { doVerify } from './verify.mjs';

const PORT = process.env.PORT || 8080;

// The Playwright page object returned by doLogin().
// Null until /login completes; used by /verify to reach the already-open browser.
let activePage = null;

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

    // Fire doLogin in the background so the HTTP response is returned immediately.
    // When doLogin finishes, it gives us back the Playwright page that is now
    // sitting on the OTP screen, ready for /verify.
    doLogin(idNumber, phoneNumber)
      .then(page => {
        activePage = page;
        console.log('[/login] Credentials submitted. OTP page is ready.');
      })
      .catch(err => {
        console.error('[/login] Error:', err);
        activePage = null;
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

    // Fire doVerify in the background so the HTTP response is returned immediately.
    // Pull the screenshots from /app/ with flyctl sftp to see the result.
    doVerify(activePage, otp)
      .then(() => console.log('[/verify] OTP submitted successfully.'))
      .catch(err => console.error('[/verify] Error:', err));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
