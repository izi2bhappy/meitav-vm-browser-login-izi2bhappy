/**
 * Verifies that GMAIL_REFRESH_TOKEN has the expected scopes.
 *
 * Usage:
 *   $env:GMAIL_CLIENT_ID="..."
 *   $env:GMAIL_CLIENT_SECRET="..."
 *   $env:GMAIL_REFRESH_TOKEN="..."
 *   node verify_token.mjs
 */

import https from 'https';

const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error('Error: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN must be set.');
  process.exit(1);
}

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const tokenRes = await post('oauth2.googleapis.com', '/token', new URLSearchParams({
  client_id: GMAIL_CLIENT_ID,
  client_secret: GMAIL_CLIENT_SECRET,
  refresh_token: GMAIL_REFRESH_TOKEN,
  grant_type: 'refresh_token',
}).toString());

if (tokenRes.error) {
  console.error('\n✗ Failed to exchange refresh token:', tokenRes.error, '-', tokenRes.error_description);
  process.exit(1);
}

const info = await get(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${tokenRes.access_token}`);

const scopes = (info.scope || '').split(' ');
const REQUIRED = ['https://mail.google.com/', 'https://www.googleapis.com/auth/drive.file'];

console.log('\nToken info:');
console.log('  Issued to:', info.email || info.azp);
console.log('  Scopes granted:');
scopes.forEach(s => console.log('   ', s));

console.log('\nScope check:');
let ok = true;
for (const s of REQUIRED) {
  const has = scopes.includes(s);
  console.log(`  ${has ? '✓' : '✗'} ${s}`);
  if (!has) ok = false;
}

console.log(ok ? '\n✓ Token is valid and has all required scopes.' : '\n✗ Token is MISSING required scopes — re-run get_refresh_token.mjs.');
