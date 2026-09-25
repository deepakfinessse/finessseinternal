"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { clockIn, pauseClock, resumeClock, clockOut } from "@/lib/actions/attendance";
import { WORK_MODES, workModeLabel } from "@/lib/attendance-constants";

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
  const [choosing, setChoosing] = useState(false);
  const tickRef = useRef(null);
  const menuRef = useRef(null);

  // Close the Active / WFH chooser on outside click or Escape.
  useEffect(() => {
    if (!choosing) return undefined;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setChoosing(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setChoosing(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [choosing]);

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
      <div ref={menuRef} className="relative">
        <button
          type="button"
          disabled={pending}
          onClick={() => setChoosing((o) => !o)}
          title="Clock in"
          aria-haspopup="menu"
          aria-expanded={choosing}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-dim transition-colors hover:border-line-strong hover:text-text disabled:opacity-50"
        >
          <Icon name="clock" size={14} />
          Log in
        </button>
        {choosing && (
          <div
            role="menu"
            className="animate-in absolute right-0 top-full z-50 mt-1.5 w-52 rounded-[12px] border border-line-strong bg-surface p-1.5 shadow-pop"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Where are you working?
            </p>
            {WORK_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => {
                  setChoosing(false);
                  act(() => clockIn(m.key));
                }}
                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${m.key === "wfh" ? "bg-caution" : "bg-ok"}`} />
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
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
      {session.workMode && (
        <span
          className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-dim"
          title={workModeLabel(session.workMode)}
        >
          {workModeLabel(session.workMode, { short: true })}
        </span>
      )}
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
