import { chromium } from 'playwright';
import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const VALID_PREFIXES = ['050', '051', '052', '053', '054', '055', '057', '058'];

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

// Opens Chrome, navigates to the Meitav login page, fills in the ID and phone
// number, and submits the first form. Returns the Playwright page object so
// that server.mjs can pass it to doVerify() for the OTP step.
export async function doLogin(idNumber, phoneNumber) {
  // Normalize international format: 972506839593 → 0506839593
  if (phoneNumber.startsWith('972')) phoneNumber = '0' + phoneNumber.slice(3);

  // Split the phone number into the 3-digit prefix (used by the <select> dropdown)
  // and the remaining 7 digits (used by the text input)
  const prefix = VALID_PREFIXES.find(p => phoneNumber.startsWith(p));
  if (!prefix) throw new Error(`Unrecognized phone prefix in "${phoneNumber}"`);
  const digits = phoneNumber.slice(prefix.length);
  if (digits.length !== 7) throw new Error(`Expected 7 digits after prefix, got ${digits.length}`);

  // ── Launch browser ──────────────────────────────────────────────────────────

  try { execSync('pkill -9 chrome', { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 500));

  for (const f of [
    '/app/screenshot-01-page-loaded.png',
    '/app/screenshot-02-credentials-filled.png',
    '/app/screenshot-03-otp-screen.png',
    '/app/screenshot-04-otp-filled.png',
    '/app/screenshot-05-authenticated.png',
    '/app/screenshot-resend.png',
  ]) {
    try { unlinkSync(f); } catch {}
  }

  console.log('Launching Chrome...');
  const browser = await chromium.launch({
    channel: 'chrome',  // use the system-installed Chrome, not Playwright's bundled Chromium
    headless: false,    // keep the window visible so we can observe and screenshot
  });

  const context = await browser.newContext({
    locale: 'he-IL',              // Hebrew locale so the site renders in Hebrew
    timezoneId: 'Asia/Jerusalem', // match the expected timezone for an Israeli user
  });

  // Remove the navigator.webdriver flag that Playwright sets by default —
  // some sites detect it and block automated browsers
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
  });

  const page = await context.newPage();

  // ── Navigate ────────────────────────────────────────────────────────────────

  console.log('Navigating to login page...');
  await page.goto('https://customers.meitav.co.il/v2/login/loginAmit', { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // Wait until the ID input is visible before we start filling anything
  await page.waitForSelector('#id-identity-input', { state: 'visible' });
  console.log('Login page ready.');

  // ── Stage 01: page loaded — empty form ─────────────────────────────────────

  await page.screenshot({ path: '/app/screenshot-01-page-loaded.png', fullPage: true });
  console.log('Screenshot saved: /app/screenshot-01-page-loaded.png');
  writeFileSync('/app/dom-01-page-loaded.html', await page.content(), 'utf-8');
  console.log('DOM saved: /app/dom-01-page-loaded.html');

  // ── Fill ID number ──────────────────────────────────────────────────────────

  console.log(`Entering ID: ${idNumber}`);
  await typeHuman(page, page.locator('#id-identity-input'), idNumber);
  await page.keyboard.press('Tab'); // triggers Angular's ng-blur validation
  await page.waitForTimeout(rand(250, 450));

  // ── Select phone prefix ─────────────────────────────────────────────────────

  console.log(`Selecting prefix: ${prefix}`);
  const prefixSelect = page.locator('select[name="prefixPhone"]');
  await prefixSelect.selectOption(prefix);
  // Dispatch a 'change' event so Angular's ng-model picks up the new value —
  // Playwright's selectOption() alone doesn't fire the event Angular is listening to
  await prefixSelect.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(rand(200, 350));

  // ── Fill phone digits ───────────────────────────────────────────────────────

  console.log(`Entering phone digits: ${digits}`);
  await typeHuman(page, page.locator('input[name="phoneNumber"]'), digits);
  await page.keyboard.press('Tab'); // triggers Angular's ng-blur validation
  await page.waitForTimeout(rand(350, 600));

  // The submit button starts disabled and becomes enabled once Angular
  // validates all fields — wait up to 15 seconds for that
  console.log('Waiting for submit button to become enabled...');
  try {
    await page.waitForSelector('button#submit:not([disabled])', { timeout: 15_000 });
  } catch {
    console.warn('Submit button did not become enabled within 15 s.');
  }

  // ── Stage 02: credentials filled — ID + phone entered, button enabled ───────

  await page.screenshot({ path: '/app/screenshot-02-credentials-filled.png', fullPage: true });
  console.log('Screenshot saved: /app/screenshot-02-credentials-filled.png');
  writeFileSync('/app/dom-02-credentials-filled.html', await page.content(), 'utf-8');
  console.log('DOM saved: /app/dom-02-credentials-filled.html');

  // ── Click submit ────────────────────────────────────────────────────────────

  console.log('Clicking submit (אישור)...');
  await page.click('button#submit');
  await page.waitForTimeout(2000); // let the page transition to the OTP screen

  // ── Stage 03: OTP screen — waiting for the user to receive and enter OTP ────

  await page.screenshot({ path: '/app/screenshot-03-otp-screen.png', fullPage: true });
  console.log('Screenshot saved: /app/screenshot-03-otp-screen.png');
  writeFileSync('/app/dom-03-otp-screen.html', await page.content(), 'utf-8');
  console.log('DOM saved: /app/dom-03-otp-screen.html');

  // Return the page so server.mjs can hold on to it and pass it to doVerify()
  return page;
}
