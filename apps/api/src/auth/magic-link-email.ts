import { emailFrom, resendApiKey } from "@shopping-mcp/config";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Delivers a magic sign-in link. With a Resend key it emails the link and never logs it (the link
 * signs someone in); without one (local development, tests) it prints the link instead.
 */
export async function sendMagicLinkEmail(
  { email, url }: { email: string; url: string },
  send: typeof fetch = fetch,
) {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.log(`Magic link for ${email}: ${url}`);
    return;
  }
  const link = escapeHtml(url);
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(),
      to: [email],
      subject: "Sign in to Shopping with Agent",
      text: `Sign in to Shopping with Agent:\n\n${url}\n\nThis link expires in 5 minutes. If you didn't ask to sign in, ignore this email.`,
      html: `<p>Sign in to Shopping with Agent:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 5 minutes. If you didn't ask to sign in, ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Resend's error explains the cause (unverified domain, test-sender recipient, rate limit).
    const detail = await response.text().catch(() => "");
    throw new Error(`Sign-in email failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
  }
}
