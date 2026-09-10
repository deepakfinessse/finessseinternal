import { requireUser, plainUser } from "@/lib/access";
import { listSessions } from "@/lib/data";
import { getCurrentSessionToken } from "@/lib/session-tracking";
import { Card, Badge } from "@/components/ui";
import { MyProfileForm, MySettingsForm, MySessionList } from "./profile-client";

export const metadata = { title: "My profile · Finessse" };

export default async function ProfilePage() {
  const me = await requireUser();
  const [sessions, currentToken] = await Promise.all([
    listSessions({ userId: me.id }),
    getCurrentSessionToken(),
  ]);
  const activeSessions = sessions.filter((s) => !s.expired);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">My profile</h1>
        <p className="text-sm text-gray">
          {me.email} · {me.roles.map((r) => r.name).join(", ") || "no role"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Personal information" description="Skill tags help managers assign work.">
          <MyProfileForm me={plainUser(me)} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Preferences">
            <MySettingsForm settings={me.settings} />
          </Card>

          <Card title="My access" description="Read-only — set by an administrator.">
            <div className="flex flex-wrap gap-1.5">
              {me.permissions.includes("*") ? (
                <span className="text-sm">Full access (Super Admin)</span>
              ) : me.permissions.length ? (
                me.permissions.map((p) => (
                  <code key={p} className="rounded bg-gray/15 px-1.5 py-0.5 text-xs">{p}</code>
                ))
              ) : (
                <span className="text-sm text-gray">No permissions.</span>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="Sessions & devices"
        description="Where you're signed in, and the app version each device is running."
        action={<Badge tone="active">{activeSessions.length} active</Badge>}
      >
        <MySessionList sessions={activeSessions} currentToken={currentToken} />
      </Card>
    </div>
  );
}
