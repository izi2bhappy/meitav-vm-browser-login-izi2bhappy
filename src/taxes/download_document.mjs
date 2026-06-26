import { writeFileSync, readFileSync } from 'fs';
import { SCREENSHOT_DIR } from './config.mjs';
const PERSONAL_AREA_URL = 'https://secapp.taxes.gov.il/sr-ezor-ishi/main/main-page';
const FORM106_URL       = 'https://secapp.taxes.gov.il/sr-ezor-ishi/main/form106?fromPage=main-page';

// Full navigation flow after authentication:
//   personal area → click "טפסי 106" → expand 2025 accordion → capture PDF
export async function doTaxesDownloadDocument(page) {

  // ── Step 1: personal area → click "טפסי 106" ────────────────────────────────
  // After OTP the browser lands on PERSONAL_AREA_URL. Skip if we are already
  // on the form 106 page (re-runs of /taxes/download_document).
  if (!page.url().includes('form106')) {
    // If somehow the page drifted away from the personal area, navigate back.
    if (!page.url().includes('sr-ezor-ishi/main/main-page')) {
      console.log('[taxes/download] Navigating to personal area...');
      await page.goto(PERSONAL_AREA_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }

    console.log('[taxes/download] Waiting for personal area to render...');
    await page.waitForSelector('text=טפסי 106', { timeout: 30_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/taxes-screenshot-06-personal-area.png`, fullPage: true });
    writeFileSync(`${SCREENSHOT_DIR}/taxes-dom-06-personal-area.html`, await page.content(), 'utf-8');
    console.log('[taxes/download] Screenshot saved: taxes-screenshot-06-personal-area.png');

    console.log('[taxes/download] Clicking טפסי 106...');
    await page.locator('text=טפסי 106').first().click();
    await page.waitForURL(
      url => url.href.includes('sr-ezor-ishi/main/form106'),
      { timeout: 30_000 }
    );
    console.log(`[taxes/download] Reached form 106 page: ${page.url()}`);
  }

  // ── Step 2: wait for the accordion to render ─────────────────────────────────
  await page.waitForSelector('details.accordion__item', { timeout: 15_000 });

  await page.screenshot({ path: `${SCREENSHOT_DIR}/taxes-screenshot-07-form106-loaded.png`, fullPage: true });
  writeFileSync(`${SCREENSHOT_DIR}/taxes-dom-07-form106-loaded.html`, await page.content(), 'utf-8');
  console.log('[taxes/download] Screenshot saved: taxes-screenshot-07-form106-loaded.png');

  // ── Step 3: expand the 2025 accordion ────────────────────────────────────────
  const firstLink2025 = page.locator('a[role="button"][aria-label*="2025"]').first();
  const alreadyVisible = await firstLink2025.isVisible().catch(() => false);

  if (!alreadyVisible) {
    console.log('[taxes/download] Expanding 2025 accordion...');
    await page.locator('h3.accordion__heading', { hasText: '2025' }).first().click();
    await page.waitForSelector('a[role="button"][aria-label*="2025"]', { timeout: 10_000 });
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/taxes-screenshot-08-dropdown-open.png`, fullPage: true });
  writeFileSync(`${SCREENSHOT_DIR}/taxes-dom-08-dropdown-open.html`, await page.content(), 'utf-8');
  console.log('[taxes/download] Screenshot saved: taxes-screenshot-08-dropdown-open.png');

  // ── Step 4: capture the PDF ───────────────────────────────────────────────────
  // We don't know how Angular will deliver the PDF, so we race three mechanisms:
  //   1. download event    — blob/<a> downloads Playwright resolves for us
  //   2. response monitor  — XHR/fetch responses with content-type: application/pdf
  //   3. new-page monitor  — same as (2) but attached to any popup that opens

  let captured = false;

  const pdfCapture = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('PDF not captured within 30 s — the site may have changed its delivery method')),
      30_000
    );

    const done = (result) => {
      if (captured) return;
      captured = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Mechanism 1: Playwright download event
    page.once('download', dl => {
      console.log('[taxes/download] Captured via download event.');
      done({ type: 'download', download: dl });
    });

    // Mechanism 2 & 3: HTTP response with PDF content type
    const attachResponseHandler = (p) => {
      p.on('response', async (response) => {
        if (captured) return;
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('application/pdf')) return;
        try {
          const body = await response.body();
          console.log(`[taxes/download] Captured via response monitor: ${response.url()}`);
          done({ type: 'response', buffer: body, url: response.url() });
        } catch {
          // body() can fail if the response was already consumed; ignore
        }
      });
    };

    attachResponseHandler(page);
    page.context().on('page', newPage => attachResponseHandler(newPage));
  });

  console.log('[taxes/download] Clicking first form 106 link...');
  await firstLink2025.click();

  const result = await pdfCapture;

  // ── Step 5: save the file ─────────────────────────────────────────────────────
  let buffer, filename, savePath;

  if (result.type === 'download') {
    filename = result.download.suggestedFilename() || 'form_106.pdf';
    savePath = `${SCREENSHOT_DIR}/${filename}`;
    await result.download.saveAs(savePath);
    buffer = readFileSync(savePath);
  } else {
    buffer = result.buffer;
    const urlPath = new URL(result.url).pathname;
    filename = urlPath.split('/').pop() || 'form_106.pdf';
    if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
    savePath = `${SCREENSHOT_DIR}/${filename}`;
    writeFileSync(savePath, buffer);
  }

  console.log(`[taxes/download] PDF saved: ${savePath} (${buffer.length} bytes)`);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/taxes-screenshot-09-after-download.png`, fullPage: true });
  writeFileSync(`${SCREENSHOT_DIR}/taxes-dom-09-after-download.html`, await page.content(), 'utf-8');
  console.log('[taxes/download] Screenshot saved: taxes-screenshot-09-after-download.png');

  return { buffer, filename, savePath };
}
