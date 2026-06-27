import { doEmailDocument } from '../../email_document.mjs';
import { doUploadToDrive } from '../../upload_to_drive.mjs';
import { session } from '../session.mjs';

export async function handleEmailDocument(req, res, payload) {
  console.log('[/taxes/email_document] request received');

  if (!session.taxesLastDownload) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'no document available — call /taxes/download_document first' }));
    return;
  }

  try {
    const [driveLink] = await Promise.all([
      doUploadToDrive(session.taxesLastDownload.savePath, session.taxesLastDownload.filename),
      doEmailDocument(session.taxesLastDownload.savePath, session.taxesLastDownload.filename),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'delivered', filename: session.taxesLastDownload.filename, driveLink, emailedTo: 'israelkariti@gmail.com' }));
  } catch (err) {
    console.error('[/taxes/email_document] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
