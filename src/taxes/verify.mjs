import { writeFileSync } from 'fs';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function typeHuman(page, locator, text) {
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(rand(80, 150));
  }
}

// Receives the page sitting on the OTP screen, types the 6-digit code,
// clicks כניסה, and waits for navigation to the personal area.
export async function doTaxesVerify(page, otpCode) {
  console.log(`[taxes/verify] Entering OTP: ${otpCode}`);
  await typeHuman(page, page.locator('#onetimecode'), String(otpCode));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(rand(300, 500));

  await page.screenshot({ path: '/app/taxes-screenshot-04-otp-filled.png', fullPage: true });
  writeFileSync('/app/taxes-dom-04-otp-filled.html', await page.content(), 'utf-8');

  console.log('[taxes/verify] Clicking כניסה (enter)...');
  await page.locator('button.btn-primary', { hasText: 'כניסה' }).click();

  // Wait until the browser reaches the personal area main page
  await page.waitForURL(
    url => url.href.includes('sr-ezor-ishi/main/main-page'),
    { timeout: 30_000 }
  );
  console.log('[taxes/verify] Authenticated — reached personal area.');

  await page.screenshot({ path: '/app/taxes-screenshot-05-authenticated.png', fullPage: true });
  writeFileSync('/app/taxes-dom-05-authenticated.html', await page.content(), 'utf-8');
}
