"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 192;

type MessageComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** Accessible name for both the textarea and the send button. */
  label: string;
  /**
   * Blocks editing because the view is busy (a response is in flight). This is
   * NOT "there is nothing to send" — that only gates the send button, so an
   * empty composer must stay typeable.
   */
  disabled?: boolean;
  /** Optional status line shown beside the send button. */
  hint?: ReactNode;
};

/**
 * Chat composer shared by the onboarding interview and the assistant chat:
 * an auto-growing textarea (Enter to send, Shift+Enter for a newline) inside a
 * container that highlights on focus, plus a send button that only activates
 * once there is something to send.
 */
export function MessageComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  disabled = false,
  hint,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a cap, then scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div>
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-card border border-line-strong bg-bg-muted p-2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
        <label htmlFor="composer-input" className="sr-only">
          {label}
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          placeholder={placeholder}
          className="max-h-48 min-h-6 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-relaxed text-ink transition-colors placeholder:text-ink-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label={label}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-control transition-colors",
            canSend
              ? "cursor-pointer bg-brand text-brand-fg hover:bg-brand-hover"
              : "cursor-not-allowed bg-line text-ink-subtle opacity-60",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {hint ? (
        <p className="mx-auto mt-2 max-w-3xl text-center text-[0.6875rem] leading-relaxed text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
