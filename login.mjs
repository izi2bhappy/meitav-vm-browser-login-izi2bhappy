import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const config = JSON.parse(
  readFileSync(join(__dir, 'local.config.json'), 'utf-8')
);
const { idNumber, phoneNumber, submitForm = true } = config;

// ── Phone parsing ─────────────────────────────────────────────────────────────

const VALID_PREFIXES = ['050', '051', '052', '053', '054', '055', '057', '058'];

function splitPhone(phone) {
  const prefix = VALID_PREFIXES.find(p => phone.startsWith(p));
  if (!prefix) {
    throw new Error(`Unrecognized phone prefix in "${phone}". Expected one of: ${VALID_PREFIXES.join(', ')}`);
  }
  const digits = phone.slice(prefix.length);
  if (digits.length !== 7) {
    throw new Error(`Expected 7 digits after prefix, got ${digits.length} ("${digits}") from "${phone}"`);
  }
  return { prefix, digits };
}

const { prefix, digits } = splitPhone(phoneNumber);

// ── Helpers ───────────────────────────────────────────────────────────────────

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Types text one character at a time with a random inter-keystroke delay
// to mimic human input and keep Angular's ng-model change detection happy.
async function typeHuman(page, locator, text) {
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(rand(80, 150));
  }
}

// ── Browser setup ─────────────────────────────────────────────────────────────

console.log('Launching Chrome...');
const browser = await chromium.launch({
  channel: 'chrome',   // use the user's installed Chrome
  headless: false,
});

const context = await browser.newContext({
  locale: 'he-IL',
  timezoneId: 'Asia/Jerusalem',
});

// Mask the automation flag before any page script runs
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });
});

const page = await context.newPage();

// ── Navigation ────────────────────────────────────────────────────────────────

console.log('Navigating to login page...');
await page.goto('https://customers.meitav.co.il/v2/login/loginAmit', {
  waitUntil: 'domcontentloaded',
});

await page.waitForSelector('#id-identity-input', { state: 'visible' });
console.log('Form loaded.');

// ── Fill ID number ────────────────────────────────────────────────────────────

console.log(`Entering ID: ${idNumber}`);
await typeHuman(page, page.locator('#id-identity-input'), idNumber);
await page.keyboard.press('Tab');               // triggers Angular ng-blur
await page.waitForTimeout(rand(250, 450));

// ── Select phone prefix ───────────────────────────────────────────────────────

console.log(`Selecting prefix: ${prefix}`);
const prefixSelect = page.locator('select[name="prefixPhone"]');
await prefixSelect.selectOption(prefix);
// Dispatch a bubbling 'change' event so Angular's ng-model picks up the value
await prefixSelect.evaluate(el =>
  el.dispatchEvent(new Event('change', { bubbles: true }))
);
await page.waitForTimeout(rand(200, 350));

// ── Fill phone digits ─────────────────────────────────────────────────────────

console.log(`Entering phone digits: ${digits}`);
await typeHuman(page, page.locator('input[name="phoneNumber"]'), digits);
await page.keyboard.press('Tab');               // triggers Angular ng-blur
await page.waitForTimeout(rand(350, 600));

// ── Submit ────────────────────────────────────────────────────────────────────

if (submitForm) {
  console.log('Waiting for submit button to become enabled...');
  try {
    await page.waitForSelector('button#submit:not([disabled])', { timeout: 15_000 });
  } catch {
    console.warn('Submit button did not become enabled within 15 s. The form may still be invalid.');
    console.warn('Check the browser — you can submit manually.');
    await new Promise(() => {});   // keep browser open
  }
  console.log('Clicking submit (אישור)...');
  await page.click('button#submit');
  console.log('Form submitted. Browser will stay open so you can see the result.');
} else {
  console.log('submitForm = false — skipping click. Browser will stay open.');
}

// Keep the Node process alive so the browser window remains visible
await new Promise(() => {});
