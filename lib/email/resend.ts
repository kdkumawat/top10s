import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getResendEnv } from "@/lib/env";

/**
 * Email delivery. Real mode: Resend HTTP API. Mock mode: write to ./.emails/.
 *
 * Mock path is useful for local dev — no Resend account needed, the files
 * can be inspected to verify content.
 */
const MOCK_DIR = resolve(process.cwd(), ".emails");

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function isMock(): boolean {
  // The user can also override via RESEND_MOCK env, but for the MVP we
  // treat "no RESEND_API_KEY" as mock mode.
  return !process.env.RESEND_API_KEY;
}

export async function sendEmail(args: SendArgs): Promise<{ id: string }> {
  if (isMock()) {
    return sendMock(args);
  }
  return sendResend(args);
}

async function sendResend(args: SendArgs): Promise<{ id: string }> {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = getResendEnv();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

async function sendMock(args: SendArgs): Promise<{ id: string }> {
  if (!existsSync(MOCK_DIR)) {
    await mkdir(MOCK_DIR, { recursive: true });
  }
  const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(MOCK_DIR, `${stamp}_${id}.html`);
  const wrapped = `<!doctype html>
<html><body style="font-family:system-ui,background:#0B0712;color:#F5F0FF;padding:24px">
  <p style="color:#7A6B9C;font-size:12px">to: ${escape(args.to)}</p>
  <p style="color:#7A6B9C;font-size:12px">subject: ${escape(args.subject)}</p>
  <hr style="border-color:#2D2342" />
  ${args.html}
</body></html>`;
  await writeFile(path, wrapped, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[email] mock: wrote ${path}`);
  return { id };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
