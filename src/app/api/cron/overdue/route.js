import { NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { notifyUsers, usersByPermission } from "@/lib/notifications";
import { sendMail } from "@/lib/mail";
import { baseUrl } from "@/lib/base-url";

// Triggered by Vercel Cron (see vercel.json) — never rendered, always fresh.
export const dynamic = "force-dynamic";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Finds tasks that just slipped past their due date and haven't been flagged
 * yet, and alerts the assignee plus everyone who can approve/manage work
 * (admins, managers) — both in-app and by email. `overdueNotifiedAt` makes
 * this idempotent across runs; it's cleared whenever a task is rescheduled or
 * reopened so a fresh miss gets a fresh alert.
 */
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { tasks, users, projects } = await collections();
  const now = new Date();

  const overdue = await tasks
    .find({ status: { $ne: "completed" }, endDate: { $lt: now }, overdueNotifiedAt: null })
    .toArray();

  if (!overdue.length) {
    return NextResponse.json({ ok: true, checked: 0, notified: 0 });
  }

  const [projectDocs, assigneeDocs, managers, origin] = await Promise.all([
    projects.find({ _id: { $in: overdue.map((t) => t.projectId) } }).toArray(),
    users
      .find({ _id: { $in: overdue.map((t) => t.assigneeId).filter(Boolean) }, status: "active" })
      .toArray(),
    usersByPermission("task:approve"),
    baseUrl(),
  ]);
  const projectMap = new Map(projectDocs.map((p) => [String(p._id), p]));
  const assigneeMap = new Map(assigneeDocs.map((u) => [String(u._id), u]));

  let notified = 0;
  for (const task of overdue) {
    try {
      const project = projectMap.get(String(task.projectId));
      const assignee = task.assigneeId ? assigneeMap.get(String(task.assigneeId)) : null;

      const recipients = new Map();
      if (assignee) recipients.set(String(assignee._id), assignee);
      for (const m of managers) recipients.set(String(m._id), m);

      if (recipients.size) {
        const link = `${origin}/tasks/${task._id}`;
        const title = `Overdue: ${task.title}`;
        const projectName = project?.name || "the project";
        const numbered = task.taskNumber ? ` (${task.taskNumber})` : "";

        await notifyUsers({
          userIds: [...recipients.keys()],
          type: "task.overdue",
          title,
          body: `${project?.name || "Project"} · was due ${fmtDate(task.endDate)}`,
          link,
        });

        await Promise.all(
          [...recipients.values()].map((u) =>
            sendMail({
              to: u.email,
              subject: title,
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
