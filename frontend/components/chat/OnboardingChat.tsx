"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCcw, X } from "lucide-react";

import { AssessmentProgress } from "@/components/chat/AssessmentProgress";
import { ChatMessage, type ChatMessageData } from "@/components/chat/ChatMessage";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { postJson } from "@/lib/api/csrf-client";
import { company } from "@/lib/content";

const { onboarding } = company;

/** Pause between the welcome and the first question, and between questions. */
const TYPE_DELAY_MS = 700;
/** Let the finished assessment settle on screen before the chat takes over. */
const HANDOFF_DELAY_MS = 1400;

type Stage = "loading" | "interview" | "assessing" | "done" | "error";
type Failure = "questions" | "assessment";

/** Reads the `{ error: { message } }` envelope used by the API routes. */
async function readApiError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

/**
 * Revenue Intelligence onboarding interview, shown right after a company is
 * registered.
 *
 *   1. Ask the agent backend for a tailored set of onboarding questions.
 *   2. Ask the owner one question at a time in the chat composer.
 *   3. Submit the Q&A, show the build progress, and end with the assessment.
 *   4. Refresh so the server component swaps in the assistant chat.
 *
 * The welcome message is local; the questions come from the model, so the
 * interview stays tailored to the company without shipping a fixed list.
 */
/**
 * Dismisses the interview and returns to the chat.
 *
 * The interview used to be the only way into `/chat`, so there was nothing to go
 * back to. It is now an offer, and a user who shared a report and then opened
 * this has to be able to close it and ask their actual question — the one the
 * report answers.
 */
export function OnboardingChat({ onDismiss }: { onDismiss?: () => void }) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("loading");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [typing, setTyping] = useState(false);
  const [runId, setRunId] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const delayRef = useRef<number | null>(null);

  // Keep only the most recent scheduled delay and drop it on unmount.
  const schedule = useCallback((fn: () => void, ms: number) => {
    if (delayRef.current !== null) window.clearTimeout(delayRef.current);
    delayRef.current = window.setTimeout(() => {
      delayRef.current = null;
      fn();
    }, ms);
  }, []);

  useEffect(
    () => () => {
      if (delayRef.current !== null) window.clearTimeout(delayRef.current);
    },
    [],
  );

  /** Builds the assessment from the collected Q&A and persists it. */
  const submitAssessment = useCallback(
    async (interview: string[], finalAnswers: string[]) => {
      setStage("assessing");
      setError("");
      setTyping(false);

      try {
        const response = await postJson("/api/agent/onboarding/assess", {
          questions: interview,
          answers: finalAnswers,
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, onboarding.errorSubmit));
        }

        const data = (await response.json()) as { result?: string };
        const result = data.result?.trim() ?? "";
        if (!result) throw new Error(onboarding.errorSubmit);

        setAnswers(finalAnswers);
        setMessages((prev) => [...prev, { role: "assistant", content: result }]);
        setStage("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : onboarding.errorSubmit);
        setFailure("assessment");
        setStage("error");
      }
    },
    [],
  );

  // Fetch a fresh question set every time the interview (re)starts.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStage("loading");
      setMessages([]);
      setQuestions([]);
      setAnswers([]);
      setQuestionIndex(0);
      setDraft("");
      setError("");
      setFailure(null);
      setTyping(false);

      try {
        const response = await postJson("/api/agent/onboarding/questions");
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(await readApiError(response, onboarding.errorLoad));
        }

        const data = (await response.json()) as { questions?: string[] };
        const list = (data.questions ?? []).filter((q) => q.trim().length > 0);
        if (cancelled) return;
        if (list.length === 0) throw new Error(onboarding.errorLoad);

        setQuestions(list);
        setAnswers(new Array(list.length).fill(""));
        setMessages([{ role: "assistant", content: onboarding.welcome }]);
        setStage("interview");
        setTyping(true);
        schedule(() => {
          if (cancelled) return;
          setMessages((prev) => [...prev, { role: "assistant", content: list[0] }]);
          setTyping(false);
        }, TYPE_DELAY_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : onboarding.errorLoad);
        setFailure("questions");
        setTyping(false);
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
      if (delayRef.current !== null) {
        window.clearTimeout(delayRef.current);
        delayRef.current = null;
      }
    };
  }, [runId, schedule]);

  // Once the assessment is on screen, hand over to the assistant chat.
  useEffect(() => {
    if (stage !== "done") return;
    const timer = window.setTimeout(() => router.refresh(), HANDOFF_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [stage, router]);

  // Follow the conversation as it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typing, stage]);

  // Focus the composer as soon as a question is ready to answer.
  useEffect(() => {
    if (stage === "interview" && !typing && messages.some((m) => m.role === "assistant")) {
      document.getElementById("composer-input")?.focus();
    }
  }, [stage, typing, messages]);

  function goNext() {
    const content = draft.trim();
    if (!content || typing || stage !== "interview") return;

    const nextAnswers = answers.map((a, i) => (i === questionIndex ? content : a));
    setAnswers(nextAnswers);
    setMessages((prev) => [...prev, { role: "user", content }]);
    setDraft("");

    if (questionIndex < questions.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setTyping(true);
      schedule(() => {
        setMessages((prev) => [...prev, { role: "assistant", content: questions[nextIndex] }]);
        setTyping(false);
      }, TYPE_DELAY_MS);
      return;
    }

    void submitAssessment(questions, nextAnswers);
  }

  function retry() {
    setError("");
    if (failure === "assessment") {
      void submitAssessment(questions, answers);
      return;
    }
    setRunId((id) => id + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onDismiss ? (
        <div className="flex shrink-0 justify-end border-b border-line px-4 py-2">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink"
          >
            <X className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {onboarding.dismissLabel}
          </button>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
          {stage === "loading" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                <RefreshCcw className="size-5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="text-sm text-ink-muted">{onboarding.preparingQuestions}</p>
            </div>
          ) : null}

          {messages.map((message, i) => (
            <ChatMessage key={`${message.role}-${i}`} message={message} />
          ))}

          {typing && stage === "interview" ? (
            <div className="flex items-start gap-3" aria-live="polite">
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <RefreshCcw className="size-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="rounded-card rounded-bl-md border border-line bg-bg-muted px-4 py-3.5 text-sm text-ink-muted">
                {onboarding.thinkingLabel}
              </span>
            </div>
          ) : null}

          {stage === "assessing" ? (
            <AssessmentProgress steps={onboarding.responseSteps} />
          ) : null}

          {stage === "done" ? (
            <div className="flex justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1 text-xs font-semibold text-positive">
                {onboarding.completeLabel}
              </span>
            </div>
          ) : null}

          {stage === "error" ? (
            <div className="flex items-start gap-3" role="alert">
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-negative-soft text-negative">
                <AlertCircle className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="max-w-[85%] rounded-card rounded-bl-md border border-negative/30 bg-bg-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                <p className="font-semibold text-negative">{onboarding.errorTitle}</p>
                <p className="mt-1.5">{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
                >
                  <RefreshCcw className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  {failure === "assessment" ? onboarding.retryAssessmentLabel : onboarding.retryLabel}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {stage === "interview" && !typing ? (
        <div className="shrink-0 border-t border-line bg-bg">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
            <MessageComposer
              value={draft}
              onChange={setDraft}
              onSubmit={goNext}
              placeholder={onboarding.answerPlaceholder}
              label={onboarding.answerLabel}
              hint={
                <span className="inline-flex items-center gap-1.5">
                  <span>{onboarding.questionProgressLabel}</span>
                  <span className="tabular-nums">
                    {questionIndex + 1} / {questions.length}
                  </span>
                </span>
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
