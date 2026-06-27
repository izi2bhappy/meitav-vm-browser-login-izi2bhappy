import { handleLogin } from './handlers/handle_login.mjs';
import { handleVerifyAndDeliver } from './handlers/handle_verify_and_deliver.mjs';
import { handleDownloadDocument } from './handlers/handle_download_document.mjs';
import { handleEmailDocument } from './handlers/handle_email_document.mjs';

export function isTaxesRoute(url) {
  return url.startsWith('/taxes/');
}

export async function handleTaxesRoute(req, res, payload) {
  const url = req.url;

  if (url === '/taxes/login')              return handleLogin(req, res, payload);
  if (url === '/taxes/verify_and_deliver') return handleVerifyAndDeliver(req, res, payload);
  if (url === '/taxes/download_document')  return handleDownloadDocument(req, res, payload);
  if (url === '/taxes/email_document')     return handleEmailDocument(req, res, payload);

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}
