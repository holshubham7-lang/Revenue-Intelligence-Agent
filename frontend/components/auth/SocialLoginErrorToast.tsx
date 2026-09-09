"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

const PARAM = "social_error";

function SocialLoginErrorToastInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const message = searchParams.get(PARAM);
    if (!message) return;

    toast({
      title: "Social sign-in failed",
      description: message,
      variant: "error",
    });

    // Clean the URL so a refresh doesn't show the toast again.
    const next = new URLSearchParams(searchParams.toString());
    next.delete(PARAM);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "/sign-in", { scroll: false });
  }, [searchParams, router, toast]);

  return null;
}

/**
 * Surfaces backend social-login errors (e.g. an unverified email from the
 * identity provider) as a toast. The backend redirects back to /sign-in with a
 * `social_error` query param — this component reads it once, displays it, then
 * removes it from the URL.
 */
export function SocialLoginErrorToast() {
  return (
    <Suspense fallback={null}>
      <SocialLoginErrorToastInner />
    </Suspense>
  );
}