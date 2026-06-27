import { doTaxesDownloadDocument } from '../actions/download_document.mjs';
import { session } from '../session.mjs';

export async function handleDownloadDocument(req, res, payload) {
  console.log('[/taxes/download_document] request received');

  if (!session.taxesPage) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'no active login session — call /taxes/login and /taxes/verify first' }));
    return;
  }

  try {
    const { buffer, filename, savePath } = await doTaxesDownloadDocument(session.taxesPage);
    session.taxesLastDownload = { savePath, filename };
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
}
