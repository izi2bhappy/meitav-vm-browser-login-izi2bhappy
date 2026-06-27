import { readFileSync } from 'fs';
import { SCREENSHOT_DIR } from '../config.mjs';

// Navigates the authenticated page to the trade forms list, expands the
// הצהרת תושבות (residency declaration) section, and clicks "לחץ להורדת הטופס"
// to trigger the file download. Returns the file buffer and suggested filename.
export async function doMeitavDownloadDocument(page) {
  console.log('[download_document] Navigating to tradeforms...');
  await page.goto('https://customers.meitav.co.il/tradeforms', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  // The page lists forms under two tabs — make sure the "טפסים להורדה" tab is active.
  // It is the default, but click it to be safe.
  await page.waitForSelector('text=טפסים להורדה', { timeout: 15_000 });
  await page.click('text=טפסים להורדה');
  await page.waitForTimeout(500);

  // Expand the הצהרת תושבות accordion row by clicking its title.
  console.log('[download_document] Expanding הצהרת תושבות...');
  await page.click('text=הצהרת תושבות');
  await page.waitForTimeout(500);

  // Intercept the browser download that fires when we click "לחץ להורדת הטופס".
  console.log('[download_document] Clicking לחץ להורדת הטופס...');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.click('text=לחץ להורדת הטופס'),
  ]);

  const filename = download.suggestedFilename() || 'residency_declaration.pdf';
  const savePath = `${SCREENSHOT_DIR}/${filename}`;
  await download.saveAs(savePath);
  console.log(`[download_document] Saved to ${savePath}`);

  return { buffer: readFileSync(savePath), filename, savePath };
}
