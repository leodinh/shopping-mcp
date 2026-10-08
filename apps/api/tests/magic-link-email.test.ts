import test from "node:test";
import assert from "node:assert/strict";
import { sendMagicLinkEmail } from "../src/auth/magic-link-email";

const link = "https://api.example/api/auth/magic-link/verify?token=abc&callbackURL=x";

function withEnv(env: Record<string, string | undefined>, run: () => Promise<void>) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("without a Resend key the link is printed, and nothing is sent", (context) =>
  withEnv({ RESEND_API_KEY: undefined }, async () => {
    const log = context.mock.method(console, "log", () => {});
    await sendMagicLinkEmail({ email: "a@example.test", url: link }, async () =>
      assert.fail("must not call Resend"),
    );
    assert.equal(log.mock.calls[0].arguments[0], `Magic link for a@example.test: ${link}`);
  }));

test("with a Resend key the link is emailed to the user and never logged", (context) =>
  withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM: "Shop <signin@mail.example>" }, async () => {
    const log = context.mock.method(console, "log", () => {});
    const requests: Array<{ url: string; init: RequestInit }> = [];
    await sendMagicLinkEmail({ email: "a@example.test", url: link }, async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return Response.json({ id: "email_1" });
    });
    assert.equal(log.mock.callCount(), 0);
    assert.equal(requests[0].url, "https://api.resend.com/emails");
    assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer re_test");
    const body = JSON.parse(String(requests[0].init.body));
    assert.equal(body.from, "Shop <signin@mail.example>");
    assert.deepEqual(body.to, ["a@example.test"]);
    assert.ok(body.text.includes(link));
    // The link's & is escaped in the HTML attribute.
    assert.ok(body.html.includes("token=abc&#38;callbackURL=x"));
  }));

test("a Resend failure is an error that explains the cause without leaking the key", () =>
  withEnv({ RESEND_API_KEY: "re_secret" }, async () => {
    await assert.rejects(
      sendMagicLinkEmail({ email: "a@example.test", url: link }, async () =>
        Response.json(
          { message: "You can only send testing emails to your own email address" },
          { status: 403 },
        ),
      ),
      (error: Error) => {
        assert.match(error.message, /HTTP 403 .*only send testing emails/);
        assert.doesNotMatch(error.message, /re_secret/);
        return true;
      },
    );
  }));
