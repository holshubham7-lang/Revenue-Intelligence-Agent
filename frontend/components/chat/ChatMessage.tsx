"use client";

import { Check, Copy, RefreshCcw, Sparkles } from "lucide-react";

import { Markdown } from "@/components/chat/Markdown";
import { cn } from "@/lib/utils";

export type ChatMessageData = {
  role: "user" | "assistant";
  content: string;
  /** True while tokens are still arriving for this message. */
  streaming?: boolean;
};

type ChatMessageProps = {
  message: ChatMessageData;
  onCopy?: (content: string) => void;
  onRetry?: () => void;
  copied?: boolean;
};

/** Agent avatar shown next to every assistant turn. */
function AgentAvatar() {
  return (
    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
      <Sparkles className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/**
 * One transcript turn. Assistant turns are rendered as markdown (with a caret
 * while streaming) and can offer copy/regenerate actions; user turns are plain
 * text in a brand-filled bubble aligned to the right.
 */
export function ChatMessage({
  message,
  onCopy,
  onRetry,
  copied = false,
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card rounded-br-md bg-brand px-4 py-3 text-[0.9375rem] leading-relaxed text-brand-fg shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const hasActions = Boolean(onCopy || onRetry);

  return (
    <div className="flex items-start gap-3">
      <AgentAvatar />
      <div className="max-w-[85%]">
        <div className="rounded-card rounded-bl-md border border-line bg-bg-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
          <Markdown content={message.content} />
          {message.streaming ? (
            <span
              className="ml-px inline-block h-[1.1em] w-[2px] animate-cursor-blink bg-brand align-middle"
              aria-hidden="true"
            />
          ) : null}
        </div>
        {hasActions && !message.streaming ? (
          <div className="mt-1.5 ml-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCopy?.(message.content)}
              aria-label="Copy response"
              className={cn(
                "inline-flex size-8 cursor-pointer items-center justify-center rounded-control transition-colors",
                copied
                  ? "text-brand"
                  : "text-ink-subtle hover:bg-bg-muted hover:text-ink",
              )}
            >
              {copied ? (
                <Check className="size-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Regenerate response"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-control text-ink-subtle transition-colors hover:bg-bg-muted hover:text-ink"
            >
              <RefreshCcw className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
