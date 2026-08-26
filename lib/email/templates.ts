import { formatUsdFromPaise } from "@/lib/money";

const BRAND = "top10s.lol";
const PRIMARY = "#7C3AED";
const ACCENT = "#16A34A";
const DANGER = "#DC2626";
const GOLD = "#F5C518";
const BG = "#0B0712";
const FG = "#F5F0FF";
const MUTED = "#B8A8D9";

function layout(title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:24px;font-weight:700;color:${GOLD};letter-spacing:-0.02em">${BRAND}</div>
    <h1 style="color:${FG};font-size:22px;margin:24px 0 8px">${title}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #2D2342;margin:32px 0" />
    <p style="color:${MUTED};font-size:12px">
      You're getting this because you have an active position on ${BRAND}.
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="color:${PRIMARY}">Manage your account</a>
    </p>
  </div>
</body></html>`;
}

function ctaButton(url: string, label: string, color: string): string {
  return `<a href="${url}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0">${label}</a>`;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://top10s.lol";
}

/* ============================================================
 * Templates
 * ============================================================ */

export function claimConfirmedTpl(input: {
  name: string | null;
  listingName: string;
  rank: number;
  amountPaise: number;
  listingSlug: string;
}): { subject: string; html: string } {
  const who = input.name ?? "there";
  const usd = formatUsdFromPaise(input.amountPaise);
  return {
    subject: `You claimed #${input.rank} on ${BRAND}`,
    html: layout(
      `Welcome to #${input.rank}, ${input.listingName}`,
      `<p style="color:${FG};font-size:16px;line-height:1.6">Hey ${escape(who)},</p>
       <p style="color:${FG};font-size:16px;line-height:1.6">
         Your listing <strong>${escape(input.listingName)}</strong> is now ranked
         <strong style="color:${GOLD}">#${input.rank}</strong> on ${BRAND} for
         <strong style="color:${ACCENT}">${usd}</strong>.
       </p>
       ${ctaButton(`${baseUrl()}/${input.listingSlug}`, `View your listing`, PRIMARY)}
       <p style="color:${MUTED};font-size:14px;line-height:1.6">
         Anyone can outbid you. If they do, you'll get a notice and your listing cascades
         one rank lower.
       </p>`,
    ),
  };
}

export function pushedOutTpl(input: {
  name: string | null;
  listingName: string;
  oldRank: number;
  newRank: number;
  outbidBy: string;
  outbidByPaise: number;
  listingSlug: string;
}): { subject: string; html: string } {
  const who = input.name ?? "there";
  const usd = formatUsdFromPaise(input.outbidByPaise);
  return {
    subject: `You were pushed to #${input.newRank} on ${BRAND}`,
    html: layout(
      `Pushed from #${input.oldRank} to #${input.newRank}`,
      `<p style="color:${FG};font-size:16px;line-height:1.6">Hey ${escape(who)},</p>
       <p style="color:${FG};font-size:16px;line-height:1.6">
         <strong>${escape(input.outbidBy)}</strong> outbid you at
         <strong>#${input.oldRank}</strong> for <strong style="color:${DANGER}">${usd}</strong>.
         Your listing <strong>${escape(input.listingName)}</strong> cascaded to
         <strong style="color:${GOLD}">#${input.newRank}</strong>.
       </p>
       ${ctaButton(`${baseUrl()}/${input.listingSlug}`, `View your listing`, PRIMARY)}
       <p style="color:${MUTED};font-size:14px;line-height:1.6">
         Beat the new high bid to climb back up.
       </p>`,
    ),
  };
}

export function removedTpl(input: {
  name: string | null;
  listingName: string;
  oldRank: number;
  outbidBy: string;
  outbidByPaise: number;
  listingSlug: string;
}): { subject: string; html: string } {
  const who = input.name ?? "there";
  const usd = formatUsdFromPaise(input.outbidByPaise);
  return {
    subject: `Your listing fell off the board`,
    html: layout(
      `${input.listingName} was pushed off the board`,
      `<p style="color:${FG};font-size:16px;line-height:1.6">Hey ${escape(who)},</p>
       <p style="color:${FG};font-size:16px;line-height:1.6">
         A cascade from <strong>#${input.oldRank}</strong> (outbid by
         <strong>${escape(input.outbidBy)}</strong> for <strong style="color:${DANGER}">${usd}</strong>)
         pushed your listing <strong>${escape(input.listingName)}</strong> off the board.
       </p>
       ${ctaButton(`${baseUrl()}/${input.listingSlug}`, `Re-claim a spot`, PRIMARY)}
       <p style="color:${MUTED};font-size:14px;line-height:1.6">
         Your listing is safe — just re-claim a rank to get back on the board.
       </p>`,
    ),
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
