/**
 * Run this script to get a fresh Gmail OAuth2 refresh token.
 *
 * Prerequisites:
 *   1. Add http://localhost:3000/callback as an authorized redirect URI in your
 *      Google Cloud Console → APIs & Services → Credentials → your OAuth2 client.
 *   2. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET as environment variables,
 *      or paste them directly below.
 *
 * Usage:
 *   $env:GMAIL_CLIENT_ID="your-client-id"
 *   $env:GMAIL_CLIENT_SECRET="your-client-secret"
 *   node get_refresh_token.mjs
 */

import http from 'http';
import https from 'https';
import { exec } from 'child_process';

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3000/callback';
const SCOPE         = 'https://mail.google.com/ https://www.googleapis.com/auth/drive.file';
const PORT          = 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set as environment variables.');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth' +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404); res.end(); return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('No code in callback URL.');
    server.close();
    return;
  }

  // Exchange auth code for tokens
  const body = new URLSearchParams({
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code',
  }).toString();

  const tokenRes = await new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (tokenRes.error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error from Google: ${tokenRes.error} — ${tokenRes.error_description}`);
    console.error('\nGoogle returned an error:', tokenRes);
    server.close();
    return;
  }

  const refreshToken = tokenRes.refresh_token;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2 style="font-family:sans-serif;color:green">Authorization successful! You can close this tab.</h2>');
  server.close();

  console.log('\n✓ New refresh token obtained:\n');
  console.log(refreshToken);
  console.log('\nRun this command to update fly.io:');
  console.log(`fly secrets set GMAIL_REFRESH_TOKEN="${refreshToken}" --app meitav-vm-browser-login`);
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log('\nOpening Google authorization page in your browser...');
  console.log('Make sure you log in as accaut322@gmail.com\n');
  // Open the browser on Windows
  exec(`start "" "${authUrl}"`);
});
