import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';

const RECIPIENT = 'israelkariti@gmail.com';
const SENDER   = 'accaut322@gmail.com';

export async function doEmailDocument(savePath, filename) {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN environment variables are required');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: SENDER,
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      refreshToken: GMAIL_REFRESH_TOKEN,
    },
  });

  await transporter.sendMail({
    from: SENDER,
    to: RECIPIENT,
    subject: `Meitav document: ${filename}`,
    text: 'Please find the requested Meitav document attached.',
    attachments: [{ filename, content: readFileSync(savePath), contentType: 'application/pdf' }],
  });

  console.log(`[email_document] Sent ${filename} to ${RECIPIENT}`);
}
