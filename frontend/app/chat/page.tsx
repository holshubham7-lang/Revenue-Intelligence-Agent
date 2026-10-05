import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { PrerequisiteNotice } from "@/components/ui/PrerequisiteNotice";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { company } from "@/lib/content";
import { readChatThread } from "@/lib/data/chat";
import { latestActionPlan, listSourceFiles } from "@/lib/data/pipeline";

export const metadata: Metadata = {
  title: company.chat.meta.title,
  description: company.chat.meta.description,
};

/**
 * Revenue Intelligence chat — the workspace view for a registered company.
 *
 * This is where company registration now lands, and where the reports the user
 * shares are listed, so both the transcript and the files are the same page
 * rather than a route the user is walked to in between.
 *
 * The onboarding interview is no longer a gate. It used to be the only way into
 * this page, which made a user who had just shared a report unable to ask a
 * question about it, and it still produces the assessment the chat is grounded
 * in. So it is offered from the empty state instead — `ChatWorkspace` decides
 * when — and a company that already has an assessment or a plan never sees it
 * again.
 *
 * `?thread=` names the saved conversation to reopen; without it this is a new
 * chat, which is the state the sidebar's Chat entry links to. The list of saved
 * conversations is the sidebar's own, read in `app/chat/layout.tsx`.
 *
 * A new chat starts empty rather than replaying the interview: the assistant is
 * grounded in the saved profile, assessment, and reports by the prompt it is sent
 * with, so the first question needs no transcript in front of it.
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

  const wanted = (await searchParams)?.thread;
  /* A conversation opens by id and nothing else: arriving at `/chat` without one
     is a new chat, which is what the sidebar's Chat entry links to. An id that is
     not this company's — or is gone — reads as no conversation at all. */
  const active = wanted ? await readChatThread(saved._id, wanted) : null;

  /* Read here so the panel is populated on the first paint and so the empty
     state's note is decided from the same list the panel shows — otherwise a
     company that has already shared a report is still told to share one.
     Sequential rather than concurrent because the second read is a boolean gate
     around the first, and both are single indexed lookups. */
  const reports = await listSourceFiles(saved._id);
  const hasAssessment = Boolean(saved.assessment) || Boolean(await latestActionPlan(saved._id));

  return (
    <ChatWorkspace
      threadId={active?._id ?? null}
      messages={
        active
          ? active.messages.map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : []
      }
      reports={reports.map((file) => ({
        id: file._id,
        name: file.originalName,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        rowCount: file.rowCount ?? null,
        status: file.status,
        createdAt: file.createdAt,
      }))}
      /* Only offered while the interview would add something. Re-running it for
         a company that already has an assessment would overwrite one. */
      showInterview={!hasAssessment}
    />
  );
}
