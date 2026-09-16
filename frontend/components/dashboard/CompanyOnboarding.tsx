"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Markdown } from "@/components/dashboard/Markdown";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type CompanyOnboardingProps = {
  onDone: (result?: string) => void;
};

type Stage = "loading" | "answering" | "submitting" | "result" | "error";

const INTRO_MESSAGE =
  "Welcome! Before we dive into your revenue data, I'd like to ask a few quick questions. Your answers let me tailor the assessment to your business. Answer one at a time.";

export function CompanyOnboarding({ onDone }: CompanyOnboardingProps) {
  const [stage, setStage] = useState<Stage>("loading");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [failedStage, setFailedStage] = useState<"load" | "submit" | null>(
    null,
  );
  const [runId, setRunId] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_URL}/agent/onboarding/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (cancelled) return;
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message =
            (body as { message?: string | string[] } | null)?.message ??
            "The service could not prepare your questions right now.";
          throw new Error(Array.isArray(message) ? message.join(" ") : message);
        }
        const data = (await response.json()) as { questions: string[] };
        if (cancelled) return;
        if (!data.questions.length) {
          onDoneRef.current();
          return;
        }
        setQuestions(data.questions);
        setAnswers(Array(data.questions.length).fill(""));
        setIndex(0);
        setDraft("");
        setStage("answering");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setFailedStage("load");
        setStage("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (stage === "answering") {
      inputRef.current?.focus();
    }
  }, [stage, index]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [index, stage, questions]);

  function retry() {
    setError("");
    if (failedStage === "submit") {
      void submit();
      return;
    }
    setStage("loading");
    setRunId((id) => id + 1);
  }

  function persistCurrentAnswer() {
    setAnswers((prev) => {
      const copy = [...prev];
      copy[index] = draft.trim();
      return copy;
    });
  }

  function goBack() {
    if (index === 0) return;
    persistCurrentAnswer();
    setIndex((i) => i - 1);
    setDraft(answers[index - 1] ?? "");
  }

  function goNext() {
    if (!draft.trim()) return;
    persistCurrentAnswer();
    if (index < questions.length - 1) {
      setIndex((i) => i + 1);
      setDraft(answers[index + 1] ?? "");
    } else {
      void submit();
    }
  }

  async function submit() {
    const finalAnswers = answers.map((a, i) =>
      i === index ? draft.trim() : a,
    );
    setStage("submitting");
    setError("");
    try {
      const response = await fetch(`${API_URL}/agent/onboarding/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ questions, answers: finalAnswers }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          (body as { message?: string | string[] } | null)?.message ??
          "The service could not build your assessment.";
        throw new Error(Array.isArray(message) ? message.join(" ") : message);
      }
      const data = (await response.json()) as { result: string };
      setResult(data.result);
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setFailedStage("submit");
      setStage("error");
    }
  }

  const total = questions.length;
  const answeredCount =
    stage === "answering" ? index + (draft.trim() ? 1 : 0) : total;
  const progressPercent =
    total > 0 ? Math.min(100, Math.round((answeredCount / total) * 100)) : 0;

  const canSend = Boolean(draft.trim()) && stage === "answering";

  const askedQuestions = questions.slice(
    0,
    stage === "answering" ? index : total,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
          {stage === "loading" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <Icon
                name="spark"
                size={28}
                className="animate-pulse-soft text-brand-600"
              />
              <p className="text-sm text-ink-muted">
                Preparing your questions…
              </p>
            </div>
          ) : null}

          {stage === "answering" || stage === "submitting" ? (
            <>
              {total > 0 ? (
                <div className="mx-auto w-full max-w-md">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-ink-faint">
                    <span>
                      Question {Math.min(index + 1, total)} of {total}
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                  {INTRO_MESSAGE}
                </div>
              </div>

              {askedQuestions.map((question, i) => (
                <div key={`qa-${i}`} className="space-y-6">
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                      {question}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-[0.9375rem] leading-relaxed text-white">
                      <span className="whitespace-pre-wrap">
                        {answers[i]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {stage === "answering" && index < total ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                    {questions[index]}
                  </div>
                </div>
              ) : null}

              {stage === "submitting" ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">
                    <Icon
                      name="spark"
                      size={16}
                      className="animate-pulse-soft text-brand-600"
                    />
                    Analyzing your answers…
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {stage === "result" ? (
            <>
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="mb-1.5 flex items-center gap-2 text-[0.8125rem] font-semibold text-brand-700">
                    <Icon name="check" size={15} />
                    Assessment complete
                  </div>
                  <div className="rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                    <div className="mb-4">
                      <h1 className="text-lg font-bold tracking-[-0.02em] text-ink">
                        Your Revenue Intelligence assessment
                      </h1>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                        Here&apos;s what we found. Your agent can go deeper on
                        any of this inside the chat.
                      </p>
                    </div>
                    <Markdown content={result} />
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => onDone(result)}
                  className="min-w-52"
                >
                  Start chatting with your agent
                  <Icon name="arrow-right" size={16} />
                </Button>
              </div>
            </>
          ) : null}

          {stage === "error" ? (
            <>
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-3">
                  <div className="rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                    <span className="flex items-center gap-2 font-semibold text-danger-600">
                      <Icon name="alert" size={18} />
                      We hit a snag
                    </span>
                    <p className="mt-2">{error}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pl-1">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={retry}
                    >
                      <Icon name="refresh" size={16} />
                      {failedStage === "submit"
                        ? "Retry assessment"
                        : "Try again"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => onDone()}
                      className="cursor-pointer text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
                    >
                      Skip for now and open the dashboard
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {stage === "answering" ? (
        <div className="flex border-t border-line bg-surface px-4 py-3 md:px-6">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Previous question"
                className="mb-0.5 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <Icon name="arrow-left" size={18} />
              </button>
            ) : null}
            <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-line-strong bg-surface-muted p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    goNext();
                  }
                }}
                rows={1}
                placeholder={`Answer question ${index + 1} of ${total}…`}
                aria-label={`Answer for question ${index + 1}`}
                className="max-h-48 min-h-6 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={goNext}
                disabled={!canSend}
                aria-label="Send answer"
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                  canSend
                    ? "cursor-pointer bg-brand-600 text-white hover:bg-brand-700"
                    : "cursor-not-allowed bg-surface text-ink-faint opacity-60",
                )}
              >
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}