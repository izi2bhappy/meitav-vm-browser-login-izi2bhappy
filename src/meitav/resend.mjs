import { writeFileSync } from 'fs';

// Clicks the "resend OTP" link on the OTP screen and waits for the site to
// confirm or reject the re-send. Returns 'success', 'failed', or 'timeout'.
export async function doMeitavResend(page) {
  // <a class="green-link-background" ng-click="sendSmsAgain()">יש ללחוץ כאן לשליחה חוזרת</a>
  const resendLink = page.locator('a.green-link-background');

  console.log('Clicking resend OTP link...');
  await resendLink.click();

  // Angular sets one of two flags after the request completes:
  //   isSentAgain=true   → success label (.sendAgain) becomes visible
  //   SentAgainFailed=true → failure label becomes visible
  const successLabel = page.locator('label.sendAgain');
  const failureLabel = page.locator('label[ng-show="SentAgainFailed"]');

  let result;
  try {
    await Promise.race([
      successLabel.waitFor({ state: 'visible', timeout: 10_000 }),
      failureLabel.waitFor({ state: 'visible', timeout: 10_000 }),
    ]);

    if (await successLabel.isVisible()) {
      result = 'success';
      console.log('OTP resent successfully.');
    } else {
      result = 'failed';
      console.log('Resend failed: system detected unusual attempts.');
    }
  } catch {
    result = 'timeout';
    console.warn('No resend feedback within 10 s — result unknown.');
  }

  await page.screenshot({ path: '/app/screenshot-resend.png', fullPage: true });
  console.log('Screenshot saved: /app/screenshot-resend.png');
  writeFileSync('/app/dom-resend.html', await page.content(), 'utf-8');
  console.log('DOM saved: /app/dom-resend.html');

  return result;
}
