import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type MarkdownProps = {
  content: string;
  className?: string;
};

/**
 * Renders assistant output as styled markdown (bold, italic, lists, code,
 * links, etc.) instead of showing raw `**` / `*` markers. Uses react-markdown
 * so raw HTML is never injected.
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
            <ul className="my-2 list-disc space-y-1 pl-5 marker:text-brand-500 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }: { children?: ReactNode }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-brand-500 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }: { children?: ReactNode }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          h1: ({ children }: { children?: ReactNode }) => (
            <h1 className="mb-2 mt-3 text-lg font-semibold text-ink first:mt-0">{children}</h1>
          ),
          h2: ({ children }: { children?: ReactNode }) => (
            <h2 className="mb-2 mt-3 text-base font-semibold text-ink first:mt-0">{children}</h2>
          ),
          h3: ({ children }: { children?: ReactNode }) => (
            <h3 className="mb-2 mt-3 text-[0.9375rem] font-semibold text-ink first:mt-0">{children}</h3>
          ),
          a: ({ href, children }: { href?: string; children?: ReactNode }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              {children}
            </a>
          ),
          code: ({ children }: { children?: ReactNode }) => (
            <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[0.8125rem] text-danger-600">
              {children}
            </code>
          ),
          pre: ({ children }: { children?: ReactNode }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-surface-soft p-3 text-[0.8125rem] leading-relaxed last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="my-2 border-l-2 border-brand-300 pl-3 italic text-ink-muted last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-line" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
