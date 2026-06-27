import { writeFileSync } from 'fs';
import { SCREENSHOT_DIR } from '../config.mjs';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Types text one character at a time with a random delay between keystrokes.
// This mimics human typing and keeps Angular's ng-model change detection happy —
// a direct .fill() sets the value without firing the events Angular listens to.
async function typeHuman(page, locator, text) {
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(rand(80, 150));
  }
}

// Receives the Playwright page that doLogin() left open on the OTP screen,
// types in the 6-digit OTP, submits the form, and saves screenshots + DOM.
export async function doMeitavVerify(page, otp) {
  // ── Fill OTP ────────────────────────────────────────────────────────────────

  // The OTP input accepts exactly 6 digits; Angular validates min/max length
  console.log(`Entering OTP: ${otp}`);
  await typeHuman(page, page.locator('#codeDigitsInput'), String(otp));
  await page.keyboard.press('Tab'); // triggers Angular's ng-blur validation
  await page.waitForTimeout(rand(300, 500));

  // The submit button starts disabled and becomes enabled once Angular
  // sees a valid 6-digit value in the input
  try {
    await page.waitForSelector('button.login-id-btn:not([disabled])', { timeout: 10_000 });
  } catch {
    console.warn('OTP submit button did not become enabled within 10 s — the OTP may be wrong or too short.');
  }

  // ── Stage 04: OTP filled — code entered, button enabled ─────────────────────

  await page.screenshot({ path: `${SCREENSHOT_DIR}/screenshot-04-otp-filled.png`, fullPage: true });
  console.log(`Screenshot saved: ${SCREENSHOT_DIR}/screenshot-04-otp-filled.png`);
  writeFileSync(`${SCREENSHOT_DIR}/dom-04-otp-filled.html`, await page.content(), 'utf-8');
  console.log(`DOM saved: ${SCREENSHOT_DIR}/dom-04-otp-filled.html`);

  // ── Click OTP submit ────────────────────────────────────────────────────────

  console.log('Clicking OTP submit (אישור)...');
  await page.click('button.login-id-btn');
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30_000 });

  // ── Stage 05: authenticated — result page after OTP submit ──────────────────

  await page.screenshot({ path: `${SCREENSHOT_DIR}/screenshot-05-authenticated.png`, fullPage: true });
  console.log(`Screenshot saved: ${SCREENSHOT_DIR}/screenshot-05-authenticated.png`);
  writeFileSync(`${SCREENSHOT_DIR}/dom-05-authenticated.html`, await page.content(), 'utf-8');
  console.log(`DOM saved: ${SCREENSHOT_DIR}/dom-05-authenticated.html`);
}
