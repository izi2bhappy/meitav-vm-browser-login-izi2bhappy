import { doMeitavVerify } from '../actions/verify.mjs';
import { doMeitavDownloadDocument } from '../actions/download_document.mjs';
import { doEmailDocument } from '../../email_document.mjs';
import { doUploadToDrive } from '../../upload_to_drive.mjs';
import { session } from '../session.mjs';

export async function handleVerifyAndDeliver(req, res, payload) {
  console.log('[/meitav/verify_and_deliver] payload:', JSON.stringify(payload, null, 2));

  const otp = payload.otp ? String(payload.otp) : null;
  if (!otp) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'otp is required' }));
    return;
  }
  if (!session.meitavPage) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'no active login session — call /meitav/login first' }));
    return;
  }

  let step = 'verify';
  try {
    await doMeitavVerify(session.meitavPage, otp);
    step = 'download';
    console.log('[/meitav/verify_and_deliver] OTP verified, downloading document...');
    const { savePath, filename } = await doMeitavDownloadDocument(session.meitavPage);
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
}
