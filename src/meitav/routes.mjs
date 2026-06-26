import { doMeitavLogin } from './login.mjs';
import { doMeitavVerify } from './verify.mjs';
import { doMeitavResend } from './resend.mjs';
import { doMeitavDownloadDocument } from './download_document.mjs';
import { doEmailDocument } from '../email_document.mjs';
import { doUploadToDrive } from '../upload_to_drive.mjs';

let meitavPage = null;
let meitavLoginInProgress = false;
let meitavLastDownload = null; // { savePath, filename }

// Returns true if the URL is handled by this router.
export function isMeitavRoute(url) {
  return url.startsWith('/meitav/');
}

export async function handleMeitavRoute(req, res, payload) {
  const url = req.url;

  // ── POST /meitav/login ───────────────────────────────────────────────────────
  if (url === '/meitav/login') {
    console.log('[/meitav/login] payload:', JSON.stringify(payload, null, 2));

    const { idNumber, phoneNumber } = payload;
    if (!idNumber || !phoneNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'idNumber and phoneNumber are required' }));
      return;
    }

    if (meitavLoginInProgress) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'login already in progress — wait for it to complete' }));
      return;
    }

    meitavLoginInProgress = true;
    doMeitavLogin(idNumber, phoneNumber)
      .then(page => {
        meitavPage = page;
        meitavLoginInProgress = false;
        console.log('[/meitav/login] Credentials submitted. OTP page is ready.');
      })
      .catch(err => {
        console.error('[/meitav/login] Error:', err);
        meitavPage = null;
        meitavLoginInProgress = false;
      });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  // ── POST /meitav/resend ──────────────────────────────────────────────────────
  if (url === '/meitav/resend') {
    console.log('[/meitav/resend] request received');

    if (!meitavPage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /meitav/login first' }));
      return;
    }

    doMeitavResend(meitavPage)
      .then(result => console.log(`[/meitav/resend] result: ${result}`))
      .catch(err => console.error('[/meitav/resend] Error:', err));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  // ── POST /meitav/download_document ───────────────────────────────────────────
  if (url === '/meitav/download_document') {
    console.log('[/meitav/download_document] request received');

    if (!meitavPage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /meitav/login and /meitav/verify first' }));
      return;
    }

    try {
      const { buffer, filename, savePath } = await doMeitavDownloadDocument(meitavPage);
      meitavLastDownload = { savePath, filename };
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (err) {
      console.error('[/meitav/download_document] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── POST /meitav/verify_and_deliver ──────────────────────────────────────────
  if (url === '/meitav/verify_and_deliver') {
    console.log('[/meitav/verify_and_deliver] payload:', JSON.stringify(payload, null, 2));

    const otp = payload.otp ? String(payload.otp) : null;
    if (!otp) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'otp is required' }));
      return;
    }
    if (!meitavPage) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no active login session — call /meitav/login first' }));
      return;
    }

    let step = 'verify';
    try {
      await doMeitavVerify(meitavPage, otp);
      step = 'download';
      console.log('[/meitav/verify_and_deliver] OTP verified, downloading document...');
      const { savePath, filename } = await doMeitavDownloadDocument(meitavPage);
      meitavLastDownload = { savePath, filename };
      step = 'deliver';
      console.log('[/meitav/verify_and_deliver] Document downloaded, emailing and uploading to Drive...');
      const [driveLink] = await Promise.all([
        doUploadToDrive(savePath, filename),
        doEmailDocument(savePath, filename),
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'delivered', filename, driveLink, emailedTo: 'israelkariti@gmail.com' }));
    } catch (err) {
      console.error('[/meitav/verify_and_deliver] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, step }));
    }
    return;
  }

  // ── POST /meitav/email_document ───────────────────────────────────────────────
  if (url === '/meitav/email_document') {
    console.log('[/meitav/email_document] request received');

    if (!meitavLastDownload) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no document available — call /meitav/download_document first' }));
      return;
    }

    try {
      const [driveLink] = await Promise.all([
        doUploadToDrive(meitavLastDownload.savePath, meitavLastDownload.filename),
        doEmailDocument(meitavLastDownload.savePath, meitavLastDownload.filename),
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'delivered', filename: meitavLastDownload.filename, driveLink, emailedTo: 'israelkariti@gmail.com' }));
    } catch (err) {
      console.error('[/meitav/email_document] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}
