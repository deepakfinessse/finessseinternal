import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { listRoles, listUsers } from "@/lib/data";
import { Card, Badge, LinkButton } from "@/components/ui";
import { DeleteRoleButton } from "./role-form";

export const metadata = { title: "Roles & Access · Finessse" };

export default async function RolesPage() {
  const user = await requirePermission("role:read");
  const [roles, users] = await Promise.all([listRoles(), listUsers()]);

  const countFor = (roleId) =>
    users.filter((u) => u.roleIds.includes(roleId)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading">Roles &amp; access control</h1>
          <p className="text-sm text-gray">
            Dynamic roles. Permissions span Super Admin governance down to Assignee views.
          </p>
        </div>
        {user.can("role:create") && <LinkButton href="/settings/roles/new">New role</LinkButton>}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray/20 text-left text-xs uppercase text-gray">
                <th className="py-2 pr-3 font-semibold">Role</th>
                <th className="py-2 pr-3 font-semibold">Key</th>
                <th className="py-2 pr-3 font-semibold">Priority</th>
                <th className="py-2 pr-3 font-semibold">Permissions</th>
                <th className="py-2 pr-3 font-semibold">Members</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray/15">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-gray/5">
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/settings/roles/${r.id}`}
                      className="font-semibold hover:text-primary"
                    >
                      {r.name}
                    </Link>
                    {r.isSystem && <Badge tone="neutral">system</Badge>}
                    <div className="text-xs text-gray">{r.description}</div>
                  </td>
                  <td className="py-2.5 pr-3"><code className="text-xs">{r.key}</code></td>
                  <td className="py-2.5 pr-3">{r.priority}</td>
                  <td className="py-2.5 pr-3">
                    {r.permissions.includes("*") ? (
                      <Badge tone="active">full access</Badge>
                    ) : (
                      <span className="text-xs text-gray">
                        {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{countFor(r.id)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {user.can("role:delete") && !r.isSystem && countFor(r.id) === 0 && (
                      <DeleteRoleButton id={r.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
