import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { listUsers, listRoles } from "@/lib/data";
import { Card, Badge, LinkButton, EmptyState, fmtDate } from "@/components/ui";

export const metadata = { title: "Assignees · Finessse" };

const STATUS_TABS = ["all", "active", "invited", "suspended", "deactivated"];

export default async function TeamPage({ searchParams }) {
  const user = await requirePermission("assignee:read");
  const sp = await searchParams;
  const status = STATUS_TABS.includes(sp.status) ? sp.status : "all";
  const q = (sp.q || "").trim();

  const [people, roles] = await Promise.all([
    listUsers({ status: status === "all" ? undefined : status, q: q || undefined }),
    listRoles(),
  ]);
  const roleName = (id) => roles.find((r) => r.id === id)?.name || "—";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading">Assignees</h1>
          <p className="text-sm text-gray">
            Profiles, skill tags, roles and operational status.
          </p>
        </div>
        {user.can("assignee:invite") && (
          <LinkButton href="/onboarding">Invite assignee</LinkButton>
        )}
      </div>

      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
          <div className="flex gap-1 rounded-lg border border-gray/25 p-1">
            {STATUS_TABS.map((t) => (
              <Link
                key={t}
                href={`/team?status=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                  status === t ? "bg-primary/10 text-primary" : "text-gray hover:text-foreground"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, skill…"
            className="min-w-48 flex-1 rounded-lg border border-gray/30 bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <input type="hidden" name="status" value={status} />
          <button className="rounded-lg border border-gray/30 px-3 py-1.5 text-sm font-semibold hover:border-primary">
            Search
          </button>
        </form>

        {people.length === 0 ? (
          <EmptyState title="No assignees found">
            {q ? "Try a different search." : "Invite someone to get started."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray/20 text-left text-xs uppercase text-gray">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Roles</th>
                  <th className="py-2 pr-3 font-semibold">Skills</th>
                  <th className="py-2 pr-3 font-semibold">Version</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray/15">
                {people.map((p) => (
                  <tr key={p.id} className="hover:bg-gray/5">
                    <td className="py-2.5 pr-3">
                      <Link href={`/team/${p.id}`} className="font-semibold hover:text-primary">
                        {p.name || p.email}
                      </Link>
                      <div className="text-xs text-gray">{p.email}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.roles.map((r) => r.name).join(", ") ||
                        p.roleIds.map(roleName).join(", ") ||
                        "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {p.skills.slice(0, 4).map((s) => (
                          <span key={s} className="rounded bg-gray/15 px-1.5 py-0.5 text-xs">
                            {s}
                          </span>
                        ))}
                        {p.skills.length > 4 && (
                          <span className="text-xs text-gray">+{p.skills.length - 4}</span>
                        )}
                        {p.skills.length === 0 && <span className="text-xs text-gray">—</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{p.assignedVersion || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={p.status}>{p.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray">{fmtDate(p.createdAt)}</td>
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
