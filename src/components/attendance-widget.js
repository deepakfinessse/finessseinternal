"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { clockIn, pauseClock, resumeClock, clockOut } from "@/lib/actions/attendance";

const POLL_MS = 20000;

function fmtElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function AttendanceWidget() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const tickRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/active", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session ?? null);
    } catch {
      // offline / signed out mid-poll — ignore, try again next tick
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(poll, 0);
    const id = setInterval(poll, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(kickoff);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  useEffect(() => {
    if (session?.status !== "running") return undefined;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, [session?.status]);

  const act = (fn) => {
    startTransition(async () => {
      const res = await fn();
      if (!res?.ok && res?.error) console.warn("[attendance]", res.error);
      await poll();
    });
  };

  if (session === undefined) return null; // nothing to show before the first poll resolves

  if (!session) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => act(clockIn)}
        title="Clock in"
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-dim transition-colors hover:border-line-strong hover:text-text disabled:opacity-50"
      >
        <Icon name="clock" size={14} />
        Log in
      </button>
    );
  }

  const openSegment = session.segments[session.segments.length - 1];
  // `baseMs` is the accumulated total *excluding* the open segment, so ticking
  // `now` locally adds elapsed time exactly once instead of on top of a
  // server-side total that already included it.
  const elapsedMs =
    session.status === "running"
      ? session.baseMs + Math.max(0, now - new Date(openSegment.start).getTime())
      : session.baseMs;

  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-1.5">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${session.status === "running" ? "bg-ok" : "bg-caution"}`}
        title={session.status === "running" ? "Clocked in" : "Paused"}
      />
      <span className="mono text-[12.5px] tabular-nums">{fmtElapsed(elapsedMs)}</span>
      {session.status === "running" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => act(pauseClock)}
          className="text-[12px] font-medium text-dim transition-colors hover:text-text disabled:opacity-50"
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => act(resumeClock)}
          className="text-[12px] font-medium text-dim transition-colors hover:text-text disabled:opacity-50"
        >
          Resume
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => act(clockOut)}
        className="text-[12px] font-medium text-warn transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        Log out
      </button>
    </div>
  );
}
