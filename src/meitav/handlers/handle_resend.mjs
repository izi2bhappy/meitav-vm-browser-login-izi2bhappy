import { doMeitavResend } from '../actions/resend_otp.mjs';
import { session } from '../session.mjs';

export async function handleResend(req, res, payload) {
  console.log('[/meitav/resend] request received');

  if (!session.meitavPage) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'no active login session — call /meitav/login first' }));
    return;
  }

  doMeitavResend(session.meitavPage)
    .then(result => console.log(`[/meitav/resend] result: ${result}`))
    .catch(err => console.error('[/meitav/resend] Error:', err));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'triggered' }));
}
