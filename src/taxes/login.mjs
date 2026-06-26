import { chromium } from 'playwright';
import { writeFileSync, unlinkSync } from 'fs';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Types text one character at a time with random delays to keep Angular reactive
// form change detection happy — Angular 19 needs individual input events.
async function typeHuman(page, locator, text) {
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(rand(80, 150));
  }
}

// Opens Chrome, navigates to the taxes authority login page, fills id_number
// and user_code, clicks המשך, and waits for the OTP screen. Returns the page.
export async function doTaxesLogin(idNumber, userCode) {
  for (const f of [
    '/app/taxes-screenshot-01-page-loaded.png',
    '/app/taxes-screenshot-02-credentials-filled.png',
    '/app/taxes-screenshot-03-otp-screen.png',
    '/app/taxes-screenshot-04-otp-filled.png',
    '/app/taxes-screenshot-05-authenticated.png',
    '/app/taxes-screenshot-06-personal-area.png',
    '/app/taxes-screenshot-07-form106-loaded.png',
    '/app/taxes-screenshot-08-dropdown-open.png',
    '/app/taxes-screenshot-09-after-download.png',
    '/app/taxes-dom-01-page-loaded.html',
    '/app/taxes-dom-02-credentials-filled.html',
    '/app/taxes-dom-03-otp-screen.html',
    '/app/taxes-dom-04-otp-filled.html',
    '/app/taxes-dom-05-authenticated.html',
    '/app/taxes-dom-06-personal-area.html',
    '/app/taxes-dom-07-form106-loaded.html',
    '/app/taxes-dom-08-dropdown-open.html',
    '/app/taxes-dom-09-after-download.html',
  ]) {
    try { unlinkSync(f); } catch {}
  }

  console.log('[taxes/login] Launching Chrome...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });

  const context = await browser.newContext({
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
  });

  const page = await context.newPage();

  console.log('[taxes/login] Navigating to login page...');
  await page.goto('https://secapp.taxes.gov.il/taxes-login/login/general', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  await page.waitForSelector('#ID', { state: 'visible' });
  console.log('[taxes/login] Login page ready.');

  await page.screenshot({ path: '/app/taxes-screenshot-01-page-loaded.png', fullPage: true });
  writeFileSync('/app/taxes-dom-01-page-loaded.html', await page.content(), 'utf-8');

  console.log(`[taxes/login] Entering ID: ${idNumber}`);
  await typeHuman(page, page.locator('#ID'), idNumber);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(rand(250, 450));

  console.log('[taxes/login] Entering user code...');
  await typeHuman(page, page.locator('#code'), userCode);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(rand(350, 600));

  await page.screenshot({ path: '/app/taxes-screenshot-02-credentials-filled.png', fullPage: true });
  writeFileSync('/app/taxes-dom-02-credentials-filled.html', await page.content(), 'utf-8');

  console.log('[taxes/login] Clicking המשך (continue)...');
  await page.locator('button.btn-primary', { hasText: 'המשך' }).click();

  // Wait for navigation to the OTP screen
  await page.waitForURL(url => url.href.includes('otp'), { timeout: 30_000 });
  console.log('[taxes/login] OTP screen reached.');

  await page.screenshot({ path: '/app/taxes-screenshot-03-otp-screen.png', fullPage: true });
  writeFileSync('/app/taxes-dom-03-otp-screen.html', await page.content(), 'utf-8');

  return page;
}
