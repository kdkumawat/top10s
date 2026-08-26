import { getAllUsers } from "@/lib/db/queries/admin";
import { formatRelative } from "@/lib/format-relative";
import { AdminAction } from "@/components/admin/admin-actions";
import { Crown, Pause, Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await getAllUsers();
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-fg-subtle">
            <th className="px-3 py-2 font-medium">Joined</th>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 text-right font-medium">Positions</th>
            <th className="px-3 py-2 text-right font-medium">Bids</th>
            <th className="px-3 py-2 font-medium">Flags</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-2 font-mono text-xs text-fg-subtle">
                {formatRelative(u.createdAt)}
              </td>
              <td className="px-3 py-2">
                <p className="text-fg">{u.name ?? "—"}</p>
                <p className="font-mono text-[10px] text-fg-subtle">{u.email}</p>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{u.positions}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{u.bids}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs">
                  {u.isAdmin && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                        "border-gold/40 text-gold",
                      )}
                    >
                      <Crown className="size-3" aria-hidden /> admin
                    </span>
                  )}
                  {u.isSuspended && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                        "border-danger/40 text-danger",
                      )}
                    >
                      <Pause className="size-3" aria-hidden /> suspended
                    </span>
                  )}
                  {!u.isAdmin && !u.isSuspended && (
                    <span className="text-fg-subtle">—</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  <AdminAction
                    action="suspend"
                    target={{ kind: "user", id: u.id, suspended: u.isSuspended }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
