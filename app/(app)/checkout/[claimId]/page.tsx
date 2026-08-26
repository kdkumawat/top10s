import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bids, listings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/clerk";
import { getRazorpayMock } from "@/lib/env";
import { formatUsdFromPaise, inrPaiseToUsdCents } from "@/lib/money";
import { RazorpayCheckout } from "@/components/checkout/razorpay-checkout";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ claimId: string }> };

export default async function CheckoutPage({ params }: Ctx) {
  const { claimId } = await params;
  const user = await requireUser();

  const rows = await db
    .select({ bid: bids, listing: listings })
    .from(bids)
    .innerJoin(listings, eq(listings.id, bids.listingId))
    .where(eq(bids.id, claimId))
    .limit(1);
  if (rows.length === 0) notFound();
  const { bid, listing } = rows[0]!;
  if (bid.userId !== user.id) notFound();

  // Already captured (mock mode hits this) → show success + redirect.
  if (bid.status === "captured") {
    redirect(`/${bid.targetRank}`);
  }
  if (bid.status === "failed" || bid.status === "refunded") {
    redirect(`/dashboard?claim=${bid.id}&status=${bid.status}`);
  }

  const isMock = getRazorpayMock().RAZORPAY_MOCK;
  const usdCents = inrPaiseToUsdCents(bid.amount);
  const usdDisplay = formatUsdFromPaise(bid.amount);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="font-display text-2xl text-fg">Confirm payment</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Claiming <span className="text-fg">#{bid.targetRank}</span> for{" "}
          <span className="text-fg">{listing.name}</span>
        </p>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Amount</dt>
            <dd className="font-mono font-medium text-fg">{usdDisplay}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">INR</dt>
            <dd className="font-mono text-fg-muted">₹{(bid.amount / 100).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Receipt</dt>
            <dd className="font-mono text-xs text-fg-subtle">{bid.id.slice(0, 8)}…</dd>
          </div>
        </dl>
      </div>

      <RazorpayCheckout
        claimId={bid.id}
        listingId={listing.id}
        targetRank={bid.targetRank}
        amountPaise={bid.amount}
        usdDisplay={usdDisplay}
        usdCents={usdCents}
        isMock={isMock}
      />

      <p className="text-center text-xs text-fg-subtle">
        {isMock
          ? "Mock mode: payment auto-captures. No real money moves."
          : "Secure payment via Razorpay. Refund available within 24h of claim."}
      </p>
    </div>
  );
}
