import { doMeitavLogin } from '../actions/login.mjs';
import { session } from '../session.mjs';

export async function handleLogin(req, res, payload) {
  console.log('[/meitav/login] payload:', JSON.stringify(payload, null, 2));

  const { idNumber, phoneNumber } = payload;
  if (!idNumber || !phoneNumber) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'idNumber and phoneNumber are required' }));
    return;
  }

  if (session.meitavLoginInProgress) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'login already in progress — wait for it to complete' }));
    return;
  }

  session.meitavLoginInProgress = true;
  doMeitavLogin(idNumber, phoneNumber)
    .then(page => {
      session.meitavPage = page;
      session.meitavLoginInProgress = false;
      console.log('[/meitav/login] Credentials submitted. OTP page is ready.');
    })
    .catch(err => {
      console.error('[/meitav/login] Error:', err);
      session.meitavPage = null;
      session.meitavLoginInProgress = false;
    });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'triggered' }));
}
