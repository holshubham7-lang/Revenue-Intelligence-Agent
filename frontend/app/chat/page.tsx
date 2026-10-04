import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ChatShell } from "@/components/chat/ChatShell";
import { OnboardingChat } from "@/components/chat/OnboardingChat";
import { PrerequisiteNotice } from "@/components/ui/PrerequisiteNotice";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { company } from "@/lib/content";
import { readChatThread } from "@/lib/data/chat";
import { latestActionPlan } from "@/lib/data/pipeline";

export const metadata: Metadata = {
  title: company.chat.meta.title,
  description: company.chat.meta.description,
};

/**
 * Revenue Intelligence chat — the workspace view for a registered company.
 *
 * A company that has not been assessed yet starts in the onboarding interview.
 * Its questions are generated from the company profile and problem statement, so
 * they are specific to the business rather than a fixed list, and the assessment
 * it produces is saved on the company record.
 *
 * `?thread=` names the saved conversation to reopen; without it this is a new
 * chat, which is the state the sidebar's Chat entry links to. The list of saved
 * conversations is the sidebar's own, read in `app/chat/layout.tsx`.
 *
 * A new chat starts empty rather than replaying the interview: the assistant is
 * grounded in the saved profile and assessment by the prompt it is sent with, so
 * the first question needs no transcript in front of it.
 *
 * The legacy-plan check keeps companies from the older data-first funnel in the
 * chat rather than re-interviewing them.
 *
 * The layout already redirects unauthenticated visitors, so `user` is always
 * present here.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const cookieStore = await cookies();
  const user = await resolveSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) return null;

  const saved = await findCompanyByUserId(user._id);

  if (!saved) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-10 lg:px-12">
        <PrerequisiteNotice
          completedSteps={0}
          body="The assistant answers questions about your business, so it needs your company profile before it can help. Add your details, share your data, and we'll build your plan."
        />
      </div>
    );
  }

  // No assessment and no legacy plan means the interview hasn't run yet.
  const { assessment } = saved;
  if (!assessment && !(await latestActionPlan(saved._id))) {
    return (
      <div className="h-full w-full">
        <OnboardingChat />
      </div>
    );
  }

  const wanted = (await searchParams)?.thread;
  /* A conversation opens by id and nothing else: arriving at `/chat` without one
     is a new chat, which is what the sidebar's Chat entry links to. An id that is
     not this company's — or is gone — reads as no conversation at all. */
  const active = wanted ? await readChatThread(saved._id, wanted) : null;

  return (
    <div className="h-full w-full">
      <ChatShell
        threadId={active?._id ?? null}
        messages={
          active
            ? active.messages.map((message) => ({
                role: message.role,
                content: message.content,
              }))
            : []
        }
      />
    </div>
  );
}
