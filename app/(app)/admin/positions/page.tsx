import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, positions } from "@/lib/db/schema";
import { formatUsdFromPaise } from "@/lib/money";
import { formatRelative } from "@/lib/format-relative";
import { AdminAction } from "@/components/admin/admin-actions";

export const dynamic = "force-dynamic";

export default async function AdminPositionsPage() {
  const rows = await db
    .select({
      rank: positions.rank,
      currentBid: positions.currentBid,
      heldSince: positions.heldSince,
      frozen: positions.frozen,
      listingId: positions.listingId,
      listingName: listings.name,
      listingSlug: listings.slug,
    })
    .from(positions)
    .leftJoin(listings, eq(listings.id, positions.listingId))
    .orderBy(asc(positions.rank));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-fg-subtle">
            <th className="px-3 py-2 font-medium">Rank</th>
            <th className="px-3 py-2 font-medium">Listing</th>
            <th className="px-3 py-2 text-right font-medium">Current bid</th>
            <th className="px-3 py-2 font-medium">Held since</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.rank}>
              <td className="px-3 py-2 font-mono tabular-nums">#{p.rank}</td>
              <td className="px-3 py-2">
                {p.listingName ? (
                  <a
                    href={`/${p.listingSlug}`}
                    className="text-fg hover:text-primary"
                  >
                    {p.listingName}
                  </a>
                ) : (
                  <span className="text-fg-muted">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-accent">
                {p.listingId ? formatUsdFromPaise(p.currentBid) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-fg-subtle">
                {p.heldSince ? formatRelative(p.heldSince) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {p.frozen ? (
                  <span className="text-danger">Frozen</span>
                ) : p.listingId ? (
                  <span className="text-accent">Occupied</span>
                ) : (
                  <span className="text-fg-muted">Empty</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <AdminAction action="freeze" target={{ kind: "rank", rank: p.rank, frozen: p.frozen }} />
                  {p.listingId && (
                    <AdminAction action="remove" target={{ kind: "rank", rank: p.rank }} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
