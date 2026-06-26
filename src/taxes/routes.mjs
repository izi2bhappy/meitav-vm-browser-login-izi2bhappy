import { doTaxesLogin } from './login.mjs';
import { doTaxesVerify } from './verify.mjs';
import { doTaxesDownloadDocument } from './download_document.mjs';
import { doEmailDocument } from '../email_document.mjs';
import { doUploadToDrive } from '../upload_to_drive.mjs';

let taxesPage = null;
let taxesLoginInProgress = false;
let taxesLastDownload = null; // { savePath, filename }

export function isTaxesRoute(url) {
  return url.startsWith('/taxes/');
}

export async function handleTaxesRoute(req, res, payload) {
  const url = req.url;

  // ── POST /taxes/login ────────────────────────────────────────────────────────
  if (url === '/taxes/login') {
    console.log('[/taxes/login] payload:', JSON.stringify(payload, null, 2));

    const { idNumber, userCode } = payload;
    if (!idNumber || !userCode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'idNumber and userCode are required' }));
      return;
    }

    if (taxesLoginInProgress) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'login already in progress — wait for it to complete' }));
      return;
    }

    taxesLoginInProgress = true;
    doTaxesLogin(idNumber, userCode)
      .then(page => {
        taxesPage = page;
        taxesLoginInProgress = false;
        console.log('[/taxes/login] Credentials submitted. OTP page is ready.');
      })
      .catch(err => {
        console.error('[/taxes/login] Error:', err);
        taxesPage = null;
        taxesLoginInProgress = false;
      });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  // ── POST /taxes/verify_and_deliver ───────────────────────────────────────────
  if (url === '/taxes/verify_and_deliver') {
    console.log('[/taxes/verify_and_deliver] payload:', JSON.stringify(payload, null, 2));

    const otp = payload.otp ? String(payload.otp) : null;
    if (!otp) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'otp is required' }));
      return;
    }
    if (!taxesPage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /taxes/login first' }));
      return;
    }

    let step = 'verify';
    try {
      await doTaxesVerify(taxesPage, otp);
      step = 'download';
      console.log('[/taxes/verify_and_deliver] OTP verified, downloading document...');
      const { savePath, filename } = await doTaxesDownloadDocument(taxesPage);
      taxesLastDownload = { savePath, filename };
      step = 'deliver';
      console.log('[/taxes/verify_and_deliver] Document downloaded, emailing and uploading to Drive...');
      const [driveLink] = await Promise.all([
        doUploadToDrive(savePath, filename),
        doEmailDocument(savePath, filename),
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'delivered', filename, driveLink, emailedTo: 'israelkariti@gmail.com' }));
    } catch (err) {
      console.error('[/taxes/verify_and_deliver] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, step }));
    }
    return;
  }

  // ── POST /taxes/download_document ────────────────────────────────────────────
  if (url === '/taxes/download_document') {
    console.log('[/taxes/download_document] request received');

    if (!taxesPage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /taxes/login and /taxes/verify first' }));
      return;
    }

    try {
      const { buffer, filename, savePath } = await doTaxesDownloadDocument(taxesPage);
      taxesLastDownload = { savePath, filename };
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (err) {
      console.error('[/taxes/download_document] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── POST /taxes/email_document ───────────────────────────────────────────────
  if (url === '/taxes/email_document') {
    console.log('[/taxes/email_document] request received');

    if (!taxesLastDownload) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no document available — call /taxes/download_document first' }));
      return;
    }

    try {
      const [driveLink] = await Promise.all([
        doUploadToDrive(taxesLastDownload.savePath, taxesLastDownload.filename),
        doEmailDocument(taxesLastDownload.savePath, taxesLastDownload.filename),
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'delivered', filename: taxesLastDownload.filename, driveLink, emailedTo: 'israelkariti@gmail.com' }));
    } catch (err) {
      console.error('[/taxes/email_document] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}
