import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/clerk";
import { getListingsByUser } from "@/lib/db/queries/listings";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SP = { rank?: string };

/**
 * Server entry: resolves the user's first active listing, then delegates to a
 * tiny client component that POSTs /api/claims with that listing + the rank
 * from the query string.
 */
export default async function NewCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireUser();
  const { rank } = await searchParams;
  const targetRank = Number.parseInt(rank ?? "", 10);
  if (!Number.isInteger(targetRank) || targetRank < 1 || targetRank > 100) {
    redirect("/");
  }

  const listings = await getListingsByUser((await requireUser()).id);
  if (listings.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-8 text-center">
        <h1 className="font-display text-2xl text-fg">Create a listing first</h1>
        <p className="mt-2 text-sm text-fg-muted">
          You need a listing before you can claim a rank on the board.
        </p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/dashboard/new">Create listing</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Render a small client component that POSTs and redirects.
  const { StartClaim } = await import("./start-claim");
  return <StartClaim listingId={listings[0]!.id} targetRank={targetRank} />;
}
