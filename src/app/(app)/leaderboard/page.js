import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { getLeaderboard, LEADERBOARD_PERIODS } from "@/lib/leaderboard";
import { XP_BY_PRIORITY, PRIORITY_KEYS } from "@/lib/pm-constants";
import { PageHeader, Card, Avatar, EmptyState } from "@/components/ui";

export const metadata = { title: "Leaderboard · Finessse" };

// Matches the priority chip wording used on tasks ("urgent" shows as Critical).
const PRIORITY_NAME = { low: "Low", medium: "Medium", high: "High", urgent: "Critical" };
const MEDAL = ["🥇", "🥈", "🥉"];

function PeriodToggle({ current }) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-surface p-0.5">
      {LEADERBOARD_PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`/leaderboard?period=${p.key}`}
          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            current === p.key ? "bg-action text-action-text" : "text-dim hover:text-text"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}

function Breakdown({ byPriority }) {
  const parts = PRIORITY_KEYS.filter((k) => byPriority[k]).map((k) => `${byPriority[k]} ${PRIORITY_NAME[k]}`);
  return <span className="text-[11.5px] text-faint">{parts.join(" · ") || "—"}</span>;
}

function Podium({ top, meId }) {
  // Visual order 2 · 1 · 3, with the winner raised in the middle.
  const order = [top[1], top[0], top[2]];
  const heights = ["h-20", "h-28", "h-14"];
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {order.map((s, i) =>
        s ? (
          <div key={s.user.id} className="flex flex-col items-center text-center">
            <Avatar name={s.user.name} email={s.user.email} src={s.user.image} size={i === 1 ? 56 : 44} />
            <div className="mt-2 max-w-full truncate text-[13px] font-semibold">
              {s.user.name || s.user.email}
              {s.user.id === meId && <span className="ml-1 text-[11px] font-normal text-faint">(you)</span>}
            </div>
            <div className="text-[12px] font-semibold text-accent tabular-nums">{s.xp} XP</div>
            <div
              className={`mt-2 flex w-full items-start justify-center rounded-t-[12px] border border-b-0 border-line bg-surface-2 pt-2 text-[22px] ${heights[i]}`}
            >
              {MEDAL[s.rank - 1] || `#${s.rank}`}
            </div>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }) {
  const user = await requireUser();
  if (!user.can("task:read") && !user.can("task:read:all")) redirect("/403");
  const sp = await searchParams;
  const period = LEADERBOARD_PERIODS.some((p) => p.key === sp.period) ? sp.period : "month";

  const standings = await getLeaderboard(period);
  const mine = standings.find((s) => s.user.id === user.id) || null;
  const periodLabel = LEADERBOARD_PERIODS.find((p) => p.key === period).label.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Delivery"
        title="Leaderboard"
        description=""
        actions={<PeriodToggle current={period} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {standings.length === 0 ? (
            <Card>
              <EmptyState title="No XP earned yet">
                Nobody has completed a task {period === "all" ? "yet" : periodLabel}. XP is awarded when a task is
                approved as completed.
              </EmptyState>
            </Card>
          ) : (
            <>
              <Card>
                <Podium top={standings.slice(0, 3)} meId={user.id} />
              </Card>

              <Card title="Rankings" description={`${standings.length} ${standings.length === 1 ? "person" : "people"} scoring ${periodLabel}`}>
                <ol className="flex flex-col">
                  {standings.map((s) => {
                    const isMe = s.user.id === user.id;
                    return (
                      <li
                        key={s.user.id}
                        className={`flex items-center gap-3 border-b border-line px-2 py-2.5 last:border-0 ${
                          isMe ? "rounded-[10px] bg-surface-2" : ""
                        }`}
                      >
                        <span className="w-8 shrink-0 text-center text-[13px] font-semibold tabular-nums text-dim">
                          {MEDAL[s.rank - 1] || s.rank}
                        </span>
                        <Avatar name={s.user.name} email={s.user.email} src={s.user.image} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold">
                            {s.user.name || s.user.email}
                            {isMe && <span className="ml-1.5 text-[11px] font-normal text-faint">you</span>}
                          </div>
                          <div className="truncate">
                            {s.user.title && <span className="text-[11.5px] text-dim">{s.user.title} · </span>}
                            <Breakdown byPriority={s.byPriority} />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[15px] font-semibold tabular-nums">{s.xp} XP</div>
                          <div className="text-[11px] text-faint">
                            {s.completed} task{s.completed === 1 ? "" : "s"}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Your standing" description={LEADERBOARD_PERIODS.find((p) => p.key === period).label}>
            {mine ? (
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-[28px] font-semibold leading-none tabular-nums">#{mine.rank}</div>
                  <div className="mt-1 text-[12px] text-faint">of {standings.length}</div>
                </div>
                <div className="text-right">
                  <div className="text-[22px] font-semibold leading-none text-accent tabular-nums">{mine.xp} XP</div>
                  <div className="mt-1 text-[12px] text-faint">
                    {mine.completed} task{mine.completed === 1 ? "" : "s"} completed
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-dim">
                No XP {period === "all" ? "yet" : periodLabel}. Complete a task to get on the board.
              </p>
            )}
          </Card>

          <Card title="How XP works" description="Awarded to the assignee when a task is approved as completed.">
            <ul className="flex flex-col gap-2 text-[13px]">
              {[...PRIORITY_KEYS].reverse().map((k) => (
                <li key={k} className="flex items-center justify-between">
                  <span>{PRIORITY_NAME[k]} priority</span>
                  <span className="mono font-semibold tabular-nums">+{XP_BY_PRIORITY[k]} XP</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-[12px] text-faint">
              If a completed task is reopened, its XP is removed until it&apos;s completed again.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
