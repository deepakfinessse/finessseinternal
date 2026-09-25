import { collections } from "./db";
import { XP_BY_PRIORITY, PRIORITY_KEYS } from "./pm-constants";

export const LEADERBOARD_PERIODS = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "all", label: "All time" },
];

function periodStart(period, now = new Date()) {
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return null;
}

/**
 * XP standings for every active user who has completed at least one task in
 * the period. Each completed task gives its assignee XP by priority (see
 * XP_BY_PRIORITY); ties break on tasks completed, then on name.
 */
export async function getLeaderboard(period = "month") {
  const { tasks, users } = await collections();
  const since = periodStart(period);

  const match = { status: "completed", assigneeId: { $ne: null } };
  if (since) match.completedAt = { $gte: since };

  const xpExpr = {
    $switch: {
      branches: PRIORITY_KEYS.map((k) => ({ case: { $eq: ["$priority", k] }, then: XP_BY_PRIORITY[k] })),
      default: XP_BY_PRIORITY.medium,
    },
  };

  const rows = await tasks
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: "$assigneeId",
          xp: { $sum: xpExpr },
          completed: { $sum: 1 },
          ...Object.fromEntries(
            PRIORITY_KEYS.map((k) => [k, { $sum: { $cond: [{ $eq: ["$priority", k] }, 1, 0] } }]),
          ),
          lastCompletedAt: { $max: "$completedAt" },
        },
      },
    ])
    .toArray();

  const ids = rows.map((r) => r._id);
  const uDocs = ids.length ? await users.find({ _id: { $in: ids }, status: "active" }).toArray() : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));

  const standings = rows
    .filter((r) => uMap.has(String(r._id)))
    .map((r) => {
      const u = uMap.get(String(r._id));
      return {
        user: { id: String(u._id), name: u.name || "", email: u.email, image: u.image || null, title: u.title || "" },
        xp: r.xp,
        completed: r.completed,
        byPriority: Object.fromEntries(PRIORITY_KEYS.map((k) => [k, r[k] || 0])),
        lastCompletedAt: r.lastCompletedAt ? new Date(r.lastCompletedAt).toISOString() : null,
      };
    })
    .sort(
      (a, b) =>
        b.xp - a.xp ||
        b.completed - a.completed ||
        (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email),
    );

  // Standard competition ranking: equal XP and task count share a rank.
  let prev = null;
  standings.forEach((s, i) => {
    s.rank = prev && prev.xp === s.xp && prev.completed === s.completed ? prev.rank : i + 1;
    prev = s;
  });
  return standings;
}
