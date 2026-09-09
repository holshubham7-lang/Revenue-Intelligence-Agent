"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Markdown } from "@/components/dashboard/Markdown";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type CompanyOnboardingProps = {
  companyName?: string;
  onDone: () => void;
  onLogout: () => void;
};

type Stage = "loading" | "answering" | "submitting" | "result" | "error";

const inputBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function CompanyOnboarding({
  companyName,
  onDone,
  onLogout,
}: CompanyOnboardingProps) {
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

  function retry() {
    setError("");
    if (failedStage === "submit") {
      void submit();
      return;
    }
    setStage("loading");
    setRunId((id) => id + 1);
  }

  useEffect(() => {
    if (stage === "answering") {
      inputRef.current?.focus();
    }
  }, [stage, index]);

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
  const progressPercent =
    total > 0
      ? Math.min(
          100,
          Math.round(((index + (draft.trim() ? 1 : 0)) / total) * 100),
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-line px-6 py-4 md:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Icon name="spark" size={20} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-[-0.01em] text-ink">
              Onboarding interview
            </p>
            <p className="text-[0.6875rem] font-medium text-ink-faint">
              {companyName
                ? `Let's understand ${companyName}`
                : "Let's understand your business"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={onLogout}
          className="shrink-0"
        >
          <Icon name="logout" size={16} />
          Log out
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        {stage === "loading" || stage === "submitting" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Icon
              name="spark"
              size={28}
              className="animate-pulse-soft text-brand-600"
            />
            <p className="text-sm text-ink-muted">
              {stage === "loading"
                ? "Preparing your questions…"
                : "Analyzing your answers…"}
            </p>
          </div>
        ) : null}

        {stage === "answering" ? (
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-8 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
                <Icon name="question" size={22} />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                  A few questions before we begin
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  Answer each question one at a time. Your answers let the
                  Revenue Intelligence Agent tailor its assessment to your
                  business.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-ink">
                  Question {index + 1} of {total}
                </span>
                <span className="text-ink-faint">{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-line-strong bg-surface p-5">
              <p className="text-base font-semibold leading-relaxed text-ink">
                {questions[index]}
              </p>
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
                rows={5}
                placeholder="Type your answer…"
                aria-label={`Answer for question ${index + 1}`}
                className={`${inputBase} mt-4 resize-y`}
              />
              <div className="mt-5 flex items-center justify-between gap-3">
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={goBack}
                  >
                    <Icon name="arrow-left" size={16} />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={!draft.trim()}
                  onClick={goNext}
                  className="min-w-44"
                >
                  {index === total - 1 ? "Finish & get assessment" : "Next"}
                  {index === total - 1 ? (
                    <Icon name="check" size={16} />
                  ) : (
                    <Icon name="arrow-right" size={16} />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {stage === "result" ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-8 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
                <Icon name="check" size={22} />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                  Your Revenue Intelligence assessment
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  Here&apos;s what we found. Your agent can go deeper on any of
                  this inside the chat.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-surface-muted p-6 text-[0.9375rem] leading-relaxed text-ink md:p-8">
              <Markdown content={result} />
            </div>
            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={onDone}
                className="min-w-52"
              >
                Start chatting with your agent
                <Icon name="arrow-right" size={16} />
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "error" ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-md text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 ring-1 ring-danger-200/70">
                <Icon name="alert" size={24} />
              </span>
              <h1 className="mt-4 text-lg font-bold tracking-[-0.02em] text-ink">
                We hit a snag
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {error}
              </p>
              <div className="mt-6 flex justify-center gap-3">
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
              </div>
              <button
                type="button"
                onClick={onDone}
                className={cn(
                  "mt-4 cursor-pointer text-sm font-semibold text-ink-muted transition-colors hover:text-ink",
                )}
              >
                Skip for now and open the dashboard
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line px-6 py-4 md:px-10">
        <p className="text-center text-[0.6875rem] text-ink-faint">
          Your answers help the Revenue Intelligence Agent tailor its insights
          to your business. You can update your company profile anytime.
        </p>
      </div>
    </div>
  );
}