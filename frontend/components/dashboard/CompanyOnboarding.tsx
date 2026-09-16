"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Markdown } from "@/components/dashboard/Markdown";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type CompanyOnboardingProps = {
  onDone: (result?: string) => void;
};

type Stage = "loading" | "answering" | "submitting" | "result" | "error";

type Message = {
  role: "assistant" | "user";
  content: string;
};

const WELCOME_MESSAGE =
  "Hey! 👋 I'm the Revenue Intelligence Agent. Before we dive into your revenue data, I'd like to ask a few quick questions to tailor your assessment to your business. Let's begin!";

const THINKING_DELAY_MS = 800;

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    let typingTimer: number | null = null;
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
        setMessages([{ role: "assistant", content: WELCOME_MESSAGE }]);
        setIsTyping(true);
        typingTimer = window.setTimeout(() => {
          if (cancelled) return;
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: data.questions[0] },
          ]);
          setIsTyping(false);
        }, THINKING_DELAY_MS);
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
      if (typingTimer) window.clearTimeout(typingTimer);
    };
  }, [runId]);

  useEffect(() => {
    if (stage === "answering" && !isTyping) {
      inputRef.current?.focus();
    }
  }, [stage, index, isTyping]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  function retry() {
    setError("");
    setMessages([]);
    if (failedStage === "submit") {
      setIsTyping(true);
      void submitWithAnswers(
        answers.map((a, i) => (i === index ? draft.trim() : a)),
      );
      return;
    }
    setStage("loading");
    setRunId((id) => id + 1);
  }

  function goNext() {
    const content = draft.trim();
    if (!content || isTyping) return;
    const finalAnswers = answers.map((a, i) => (i === index ? content : a));
    setAnswers(finalAnswers);
    setMessages((prev) => [...prev, { role: "user", content }]);
    setDraft("");
    setIsTyping(true);

    if (index < questions.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: questions[nextIndex] },
        ]);
        setIsTyping(false);
      }, THINKING_DELAY_MS);
    } else {
      void submitWithAnswers(finalAnswers);
    }
  }

  async function submitWithAnswers(finalAnswers: string[]) {
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
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.result },
      ]);
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setFailedStage("submit");
      setIsTyping(false);
      setStage("error");
    }
  }

  const canSend = Boolean(draft.trim()) && stage === "answering" && !isTyping;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
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

          {(stage === "answering" ||
            stage === "submitting" ||
            stage === "result") &&
            messages.map((msg, i) => {
              if (msg.role === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-[0.9375rem] leading-relaxed text-white">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-200/60">
                    <Icon name="spark" size={16} />
                  </span>
                  <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                    {stage === "result" && i === messages.length - 1 ? (
                      <>
                        <p className="mb-3 text-sm font-semibold text-brand-700">
                          Assessment complete ✨
                        </p>
                        <Markdown content={msg.content} />
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              );
            })}

          {isTyping && stage === "answering" ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-200/60">
                <Icon name="spark" size={16} />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3.5">
                <span className="inline-block size-1.5 rounded-full bg-brand-400 animate-[pulse_1s_ease-in-out_infinite]" />
                <span className="inline-block size-1.5 rounded-full bg-brand-400 animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
                <span className="inline-block size-1.5 rounded-full bg-brand-400 animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
              </div>
            </div>
          ) : null}

          {isTyping && stage === "submitting" ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-200/60">
                <Icon name="spark" size={16} />
              </span>
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

          {stage === "error" ? (
            <>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-600 ring-1 ring-danger-200/60">
                  <Icon name="alert" size={16} />
                </span>
                <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                  <p className="font-semibold text-danger-600">
                    We hit a snag
                  </p>
                  <p className="mt-2">{error}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pl-11">
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
                  Skip for now
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {stage === "result" ? (
        <div className="border-t border-line bg-surface px-4 py-4 md:px-6">
          <div className="mx-auto flex max-w-3xl justify-center">
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
        </div>
      ) : null}

      {stage === "answering" && !isTyping
        ? createPortal(
            <>
              <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-line-strong bg-surface-muted p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
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
                  placeholder="Type your answer…"
                  aria-label="Message the Revenue Intelligence Agent"
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
              <p className="mx-auto mt-2 max-w-3xl text-center text-[0.6875rem] text-ink-faint">
                AI-powered insights help you make better decisions. Verify
                critical information when needed.
              </p>
            </>,
            document.getElementById("onboarding-input-slot") ?? document.body,
          )
        : null}
    </div>
  );
}