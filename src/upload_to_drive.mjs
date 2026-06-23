import { google } from 'googleapis';
import { createReadStream } from 'fs';

export async function doUploadToDrive(savePath, filename) {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN environment variables are required');
  }
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable is required');
  }

  const auth = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  const drive = google.drive({ version: 'v3', auth });

  const { data } = await drive.files.create({
    requestBody: { name: filename, parents: [GOOGLE_DRIVE_FOLDER_ID] },
    media: { mimeType: 'application/pdf', body: createReadStream(savePath) },
    fields: 'id,webViewLink',
  });

  await drive.permissions.create({
    fileId: data.id,
    requestBody: { role: 'reader', type: 'user', emailAddress: 'israelkariti@gmail.com' },
  });

  console.log(`[upload_to_drive] Uploaded ${filename}: ${data.webViewLink}`);
  return data.webViewLink;
}
