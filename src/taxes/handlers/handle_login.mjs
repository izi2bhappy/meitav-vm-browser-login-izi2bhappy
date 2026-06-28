import { doTaxesLogin } from '../actions/login.mjs';
import { session } from '../session.mjs';

export async function handleLogin(req, res, payload) {
  console.log('[/taxes/login] payload:', JSON.stringify(payload, null, 2));

  const { idNumber } = payload;
  const userCode = process.env.TAXES_USER_PERMANENT_CODE;
  if (!idNumber) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'idNumber is required' }));
    return;
  }
  if (!userCode) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TAXES_USER_PERMANENT_CODE environment variable is not set' }));
    return;
  }

  if (session.taxesLoginInProgress) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'login already in progress — wait for it to complete' }));
    return;
  }

  session.taxesLoginInProgress = true;
  doTaxesLogin(idNumber, userCode)
    .then(page => {
      session.taxesPage = page;
      session.taxesLoginInProgress = false;
      console.log('[/taxes/login] Credentials submitted. OTP page is ready.');
    })
    .catch(err => {
      console.error('[/taxes/login] Error:', err);
      session.taxesPage = null;
      session.taxesLoginInProgress = false;
    });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'triggered' }));
}
