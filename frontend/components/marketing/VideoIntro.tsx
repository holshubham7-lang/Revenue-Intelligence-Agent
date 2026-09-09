"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

const DEMO_VIDEO_URL =
  "https://uploads.video-commander.com/sample/BigBuckBunny.mp4";

export function VideoIntro() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function handlePlay() {
    void videoRef.current?.play();
  }

  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-24 size-[30rem] max-w-[80vw] rounded-full bg-brand-700/30 to-transparent blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-0 size-[26rem] max-w-[80vw] rounded-full bg-brand-600/20 to-transparent blur-3xl"
      />

      <div className="container-site relative py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-300">
            Product tour
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
            See Revenue Intelligence in action
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            Watch how the Revenue Agent turns your scattered revenue data into
            a prioritized growth plan in minutes.
          </p>
        </div>

        <div className="relative mx-auto mt-12 max-w-4xl lg:mt-16">
          <div
            aria-hidden="true"
            className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-brand-500/20 via-brand-400/10 to-transparent blur-2xl"
          />

          <div
            className="rounded-t-[1.4rem] rounded-b-md border border-white/10 bg-black/40 p-2.5 shadow-2xl shadow-black/50 sm:p-3"
            role="img"
            aria-label="StratVeda OS running in a browser on a laptop"
          >
            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0B1220] sm:rounded-xl">
              <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-[#FF5F57]" />
                  <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
                  <span className="size-2.5 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-center">
                  <span className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/60">
                    <Icon name="lock" size={11} className="shrink-0" />
                    <span className="truncate">app.stratveda.com/watch-tour</span>
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="hidden shrink-0 sm:block"
                />
              </div>

              <div className="relative aspect-video w-full overflow-hidden bg-ink">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-br from-brand-900/60 via-ink/40 to-brand-800/40"
                />
                <video
                  ref={videoRef}
                  src={DEMO_VIDEO_URL}
                  className="relative h-full w-full object-cover"
                  controls={started}
                  playsInline
                  preload="metadata"
                  onPlay={() => setStarted(true)}
                  onEnded={() => setStarted(false)}
                />

                {!started && (
                  <button
                    type="button"
                    onClick={handlePlay}
                    aria-label="Play product tour video"
                    className="group absolute inset-0 z-10 flex cursor-pointer items-center justify-center transition-opacity duration-300"
                  >
<span className="relative flex items-center justify-center">
                    <span className="relative flex size-20 items-center justify-center rounded-full bg-white text-brand-700 shadow-2xl transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none">
                      <Icon name="play" size={30} className="ml-1" />
                    </span>
                  </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="mx-auto h-4 w-full rounded-b-[2rem] border border-t-0 border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] sm:h-5"
          />
          <div
            aria-hidden="true"
            className="mx-auto -mt-0.5 w-24 rounded-b-lg bg-white/20"
            style={{ height: "3px" }}
          />
          <div
            aria-hidden="true"
            className="mx-auto mt-3 h-7 w-44 rounded-lg border border-white/10 bg-white/[0.04] sm:h-8"
          />
        </div>
      </div>
    </section>
  );
}