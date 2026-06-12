import { writeFileSync } from 'fs';

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
export async function doVerify(page, otp) {
  // ── Fill OTP ────────────────────────────────────────────────────────────────

  // The OTP input accepts exactly 6 digits; Angular validates min/max length
  console.log(`Entering OTP: ${otp}`);
  await typeHuman(page, page.locator('#codeDigitsInput'), String(otp));
  await page.keyboard.press('Tab'); // triggers Angular's ng-blur validation
  await page.waitForTimeout(rand(300, 500));

  // ── Submit ──────────────────────────────────────────────────────────────────

  // The submit button starts disabled and becomes enabled once Angular
  // sees a valid 6-digit value in the input
  try {
    await page.waitForSelector('button.login-id-btn:not([disabled])', { timeout: 10_000 });
  } catch {
    console.warn('OTP submit button did not become enabled within 10 s — the OTP may be wrong or too short.');
  }

  // Screenshot before clicking so we can confirm the OTP was entered correctly
  await page.screenshot({ path: '/app/screenshot-otp-before.png', fullPage: true });
  console.log('Screenshot saved: /app/screenshot-otp-before.png');

  console.log('Clicking OTP submit (אישור)...');
  await page.click('button.login-id-btn');
  await page.waitForTimeout(3000); // let the page navigate to the authenticated area

  // Screenshot after OTP submit — should show the logged-in dashboard if successful
  await page.screenshot({ path: '/app/screenshot-otp-after.png', fullPage: true });
  console.log('Screenshot saved: /app/screenshot-otp-after.png');

  // Save the final DOM for inspection
  writeFileSync('/app/dom-after-otp.html', await page.content(), 'utf-8');
  console.log('DOM saved: /app/dom-after-otp.html');
}
