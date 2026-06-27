import { handleLogin } from './handlers/handle_login.mjs';
import { handleResend } from './handlers/handle_resend.mjs';
import { handleVerifyAndDeliver } from './handlers/handle_verify_and_deliver.mjs';

export function isMeitavRoute(url) {
  return url.startsWith('/meitav/');
}

export async function handleMeitavRoute(req, res, payload) {
  const url = req.url;

  if (url === '/meitav/login')              return handleLogin(req, res, payload);
  if (url === '/meitav/resend')             return handleResend(req, res, payload);
  if (url === '/meitav/verify_and_deliver') return handleVerifyAndDeliver(req, res, payload);

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}
