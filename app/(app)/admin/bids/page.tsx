import { getAllBids } from "@/lib/db/queries/admin";
import { formatUsdFromPaise } from "@/lib/money";
import { formatRelative } from "@/lib/format-relative";
import { AdminAction } from "@/components/admin/admin-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminBidsPage() {
  const bids = await getAllBids(200);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-fg-subtle">
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Listing</th>
            <th className="px-3 py-2 font-medium">Rank</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bids.map((b) => (
            <tr key={b.id}>
              <td className="px-3 py-2 font-mono text-xs text-fg-subtle">
                {formatRelative(b.createdAt)}
              </td>
              <td className="px-3 py-2">
                <p className="text-fg">{b.userName ?? "—"}</p>
                <p className="font-mono text-[10px] text-fg-subtle">{b.userEmail}</p>
              </td>
              <td className="px-3 py-2">
                <a href={`/${b.listingSlug}`} className="text-fg hover:text-primary">
                  {b.listingName}
                </a>
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">#{b.targetRank}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-accent">
                {formatUsdFromPaise(b.amount)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    b.status === "captured" && "border-accent/40 text-accent",
                    b.status === "pending" && "border-urgency/40 text-urgency",
                    b.status === "refunded" && "border-fg-muted/40 text-fg-muted",
                    b.status === "failed" && "border-danger/40 text-danger",
                  )}
                >
                  {b.status}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  {b.status === "captured" && (
                    <AdminAction action="refund" target={{ kind: "bid", id: b.id }} />
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
