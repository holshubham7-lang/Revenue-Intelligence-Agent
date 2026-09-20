import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function DashboardFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink">
      <div className="grid h-12 grid-cols-3 items-center gap-4 px-4 md:px-6">
        <div className="flex items-center">
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6875rem] font-medium text-white/50 sm:block">
            v1.0.0
          </span>
        </div>

        <div className="h-12 flex items-center justify-center text-xs text-white/60">
          <span className="text-center">Copyright &copy; {new Date().getFullYear()} StratVeda Technologies Pvt. Ltd. All rights reserved. </span>
        </div>

        <div className="flex items-center justify-end gap-4 text-xs text-white/60">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Icon name="shield" size={14} className="text-brand-400" />
            256-bit encryption · SOC 2-ready
          </span>
          <span className="hidden h-3.5 w-px bg-white/10 sm:block" />
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="cursor-pointer transition-colors hover:text-white"
            >
              Privacy
            </Link>
            <Link
              href="/"
              className="cursor-pointer transition-colors hover:text-white"
            >
              Terms
            </Link>
            <span className="cursor-pointer transition-colors hover:text-white">
              Status
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}