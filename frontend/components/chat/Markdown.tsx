import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

type MarkdownProps = {
  content: string;
  className?: string;
};

/**
 * Renders assistant output as styled markdown (bold, italic, lists, code,
 * links) instead of showing raw `**` / `*` markers. Uses react-markdown so raw
 * HTML is never injected, and is styled with the v1.1 tokens so assistant
 * output matches the surrounding surface in both themes.
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn(className)}>
      <ReactMarkdown
        components={{
          p: ({ children }: { children?: ReactNode }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          strong: ({ children }: { children?: ReactNode }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          em: ({ children }: { children?: ReactNode }) => (
            <em className="italic text-ink-muted">{children}</em>
          ),
          ul: ({ children }: { children?: ReactNode }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 marker:text-brand last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }: { children?: ReactNode }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-brand last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }: { children?: ReactNode }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          h1: ({ children }: { children?: ReactNode }) => (
            <h3 className="mb-2 mt-3 font-display text-base font-bold tracking-tight text-ink first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }: { children?: ReactNode }) => (
            <h3 className="mb-2 mt-3 font-display text-base font-bold tracking-tight text-ink first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }: { children?: ReactNode }) => (
            <h3 className="mb-2 mt-3 font-display text-[0.9375rem] font-bold tracking-tight text-ink first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }: { children?: ReactNode }) => (
            <h4 className="mb-1.5 mt-2 font-display text-sm font-bold text-ink first:mt-0">
              {children}
            </h4>
          ),
          a: ({ href, children }: { href?: string; children?: ReactNode }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="text-brand underline underline-offset-2 hover:text-brand-hover"
            >
              {children}
            </a>
          ),
          code: ({ children }: { children?: ReactNode }) => (
            <code className="rounded bg-bg-inset px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">
              {children}
            </code>
          ),
          pre: ({ children }: { children?: ReactNode }) => (
            <pre className="my-2 overflow-x-auto rounded-control bg-bg-inset p-3 text-[0.8125rem] leading-relaxed last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="my-2 border-l-2 border-brand-line pl-3 text-ink-muted last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }: { children?: ReactNode }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }: { children?: ReactNode }) => (
            <th className="border-b border-line px-2 py-1 font-semibold text-ink">
              {children}
            </th>
          ),
          td: ({ children }: { children?: ReactNode }) => (
            <td className="border-b border-line px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-3 border-line" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
