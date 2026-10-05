"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MESSAGE_LIFETIME_MS = 10000;
const FADE_DURATION_MS = 500;

/**
 * An inline error/success message that fades out on its own after a while.
 * The parent remounts this via `key` on every new action result, so even a
 * second, identically-worded message restarts the clock from a clean state.
 */
function DismissibleMessage({ tone, children }) {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), MESSAGE_LIFETIME_MS);
    return () => clearTimeout(fadeTimer);
  }, []);

  useEffect(() => {
    if (!fading) return;
    const hideTimer = setTimeout(() => setHidden(true), FADE_DURATION_MS);
    return () => clearTimeout(hideTimer);
  }, [fading]);

  if (hidden) return null;

  const toneClass =
    tone === "error" ? "border-secondary/40 bg-secondary/10" : "border-primary/30 bg-primary/10";

  return (
    <p
      className={`mt-2 rounded-lg border px-3 py-2 text-sm transition-opacity ease-out ${toneClass} ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
    >
      {children}
    </p>
  );
}

export function SubmitButton({ children, variant = "primary", className = "", disabled = false }) {
  const { pending } = useFormStatus();
  const styles =
    variant === "primary"
      ? "bg-primary text-white hover:opacity-90"
      : variant === "danger"
        ? "bg-secondary text-black hover:opacity-90"
        : "border border-gray/30 hover:border-primary hover:text-primary";
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50 ${styles} ${className}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/**
 * Wraps a server action with useActionState, renders inline error/success, and
 * optionally navigates on `{ redirect }` in the result.
 */
export function ActionForm({
  action,
  children,
  onDone,
  successMessage,
  className = "",
  hidden = {},
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();

  // Each new result needs a fresh DismissibleMessage instance — including a
  // repeat of the same wording — so its fade timer restarts. Rather than
  // reset that child's state from an effect, give it a new `key` the moment
  // `state` changes, computed here during render (React's documented pattern
  // for deriving state from a changed prop without an extra effect).
  const [prevState, setPrevState] = useState(state);
  const [msgKey, setMsgKey] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    setMsgKey((k) => k + 1);
  }

  useEffect(() => {
    if (state?.ok) {
      if (state.redirect) router.push(state.redirect);
      else router.refresh();
      onDone?.(state);
    }
  }, [state, router, onDone]);

  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      {state?.error && (
        <DismissibleMessage key={msgKey} tone="error">
          {state.error}
        </DismissibleMessage>
      )}
      {state?.ok && successMessage && (
        <DismissibleMessage key={msgKey} tone="success">
          {typeof successMessage === "function" ? successMessage(state) : successMessage}
        </DismissibleMessage>
      )}
    </form>
  );
}
