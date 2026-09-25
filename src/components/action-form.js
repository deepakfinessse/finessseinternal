"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
        <p className="mt-2 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state?.ok && successMessage && (
        <p className="mt-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {typeof successMessage === "function"
            ? successMessage(state)
            : successMessage}
        </p>
      )}
    </form>
  );
}
