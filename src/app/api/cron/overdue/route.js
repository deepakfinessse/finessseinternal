import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { notifyUsers, permissionHoldersByScope } from "@/lib/notifications";
import { sendMail } from "@/lib/mail";
import { baseUrl } from "@/lib/base-url";
import { overdueCutoff } from "@/lib/pm-constants";

// Triggered by Vercel Cron (see vercel.json) — never rendered, always fresh.
export const dynamic = "force-dynamic";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Finds tasks that just slipped past their due date and haven't been flagged
 * yet, and alerts the assignee plus everyone who can approve/manage work —
 * admins/super-admins always, managers only for their own team — both in-app
 * and by email. `overdueNotifiedAt` makes this idempotent across runs; it's
 * cleared whenever a task is rescheduled or reopened so a fresh miss gets a
 * fresh alert.
 */
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { tasks, users, projects, teams } = await collections();
  const now = new Date();

  const overdue = await tasks
    .find({ status: { $ne: "completed" }, endDate: { $lt: overdueCutoff() }, overdueNotifiedAt: null })
    .toArray();

  if (!overdue.length) {
    return NextResponse.json({ ok: true, checked: 0, notified: 0 });
  }

  const teamIds = [...new Set(overdue.map((t) => t.teamId).filter(Boolean).map(String))];

  const [projectDocs, assigneeDocs, { unrestricted, scoped }, teamDocs, origin] = await Promise.all([
    projects.find({ _id: { $in: overdue.map((t) => t.projectId) } }).toArray(),
    users
      .find({ _id: { $in: overdue.map((t) => t.assigneeId).filter(Boolean) }, status: "active" })
      .toArray(),
    permissionHoldersByScope("task:approve"),
    teamIds.length
      ? teams.find({ _id: { $in: teamIds.map((id) => new ObjectId(id)) } }, { projection: { memberIds: 1 } }).toArray()
      : [],
    baseUrl(),
  ]);
  const projectMap = new Map(projectDocs.map((p) => [String(p._id), p]));
  const assigneeMap = new Map(assigneeDocs.map((u) => [String(u._id), u]));
  // Per-team member sets, so a Manager (scoped) only surfaces for their own
  // team's overdue tasks — admins/super-admins (unrestricted) always see all.
  const teamMembersById = new Map(teamDocs.map((t) => [String(t._id), new Set((t.memberIds || []).map(String))]));
  const managersForTeam = (teamId) => {
    if (!teamId) return [...unrestricted, ...scoped];
    const members = teamMembersById.get(String(teamId));
    return [...unrestricted, ...(members ? scoped.filter((u) => members.has(String(u._id))) : [])];
  };

  let notified = 0;
  for (const task of overdue) {
    try {
      const project = projectMap.get(String(task.projectId));
      const assignee = task.assigneeId ? assigneeMap.get(String(task.assigneeId)) : null;

      const recipients = new Map();
      if (assignee) recipients.set(String(assignee._id), assignee);
      for (const m of managersForTeam(task.teamId)) recipients.set(String(m._id), m);

      if (recipients.size) {
        const link = `${origin}/tasks/${task._id}`;
        const projectName = project?.name || "the project";
        const numbered = task.taskNumber ? ` (${task.taskNumber})` : "";
        const title = `Overdue: ${task.title}`;

        await notifyUsers({
          userIds: [...recipients.keys()],
          type: "task.overdue",
          title,
          body: `${projectName}${task.taskNumber ? ` · ${task.taskNumber}` : ""} · was due ${fmtDate(task.endDate)}`,
          link,
        });

        await Promise.all(
          [...recipients.values()].map((u) =>
            sendMail({
              to: u.email,
              subject: `${title}${numbered}`,
              text: `"${task.title}"${numbered} in ${projectName} was due ${fmtDate(task.endDate)} and is now overdue.\n\nOpen it: ${link}`,
              html: `<p><strong>${task.title}</strong>${numbered} in ${projectName} was due ${fmtDate(task.endDate)} and is now overdue.</p><p><a href="${link}">Open the task</a>.</p>`,
            }),
          ),
        );
      }

      await tasks.updateOne({ _id: task._id }, { $set: { overdueNotifiedAt: now } });
      notified += 1;
    } catch (err) {
      console.error("[cron/overdue] failed for task", String(task._id), err);
    }
  }

  return NextResponse.json({ ok: true, checked: overdue.length, notified });
}
