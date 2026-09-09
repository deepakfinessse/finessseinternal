import { requirePermission } from "@/lib/access";
import { listAuditLog } from "@/lib/data";
import { Card, EmptyState, fmtDateTime } from "@/components/ui";

export const metadata = { title: "Audit log · Finessse" };

export default async function AuditPage() {
  await requirePermission("audit:read");
  const entries = await listAuditLog({ limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Audit log</h1>
        <p className="text-sm text-gray">
          Every access-control, onboarding, session and version change.
        </p>
      </div>

      <Card>
        {entries.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray/20 text-left text-xs uppercase text-gray">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Actor</th>
                  <th className="py-2 pr-3 font-semibold">Action</th>
                  <th className="py-2 pr-3 font-semibold">Target</th>
                  <th className="py-2 pr-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray/15">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-3 text-xs text-gray whitespace-nowrap">
                      {fmtDateTime(e.createdAt)}
                    </td>
                    <td className="py-2 pr-3 text-xs">{e.actor}</td>
                    <td className="py-2 pr-3"><code className="text-xs">{e.action}</code></td>
                    <td className="py-2 pr-3 text-xs text-gray">
                      {e.targetType ? `${e.targetType}:${String(e.targetId).slice(-6)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray">
                      {Object.keys(e.meta).length
                        ? JSON.stringify(e.meta).slice(0, 120)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
