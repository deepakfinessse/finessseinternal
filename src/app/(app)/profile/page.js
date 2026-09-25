import { requireUser, plainUser } from "@/lib/access";
import { listSessions } from "@/lib/data";
import { getCurrentSessionToken } from "@/lib/session-tracking";
import { Card, Badge } from "@/components/ui";
import { MyProfileForm, MySessionList } from "./profile-client";

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

      <Card title="Personal information" description="Your name, title, contact and date of birth.">
        <MyProfileForm me={plainUser(me)} />
      </Card>

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
