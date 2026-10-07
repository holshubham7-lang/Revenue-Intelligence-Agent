"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
  leading?: ReactNode;
};

export function SearchableSelect({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  onChange,
  disabled = false,
  required = false,
}: {
  id: string;
  value: string;
  options: readonly SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return options;
    return options.filter((option) =>
      `${option.label} ${option.searchText ?? ""}`.toLocaleLowerCase().includes(search),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closePicker();
    };
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [open]);

  function closePicker(restoreFocus = false) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function focusOption(index: number) {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]");
    if (!items?.length) return;
    items[(index + items.length) % items.length]?.focus();
  }

  function choose(option: SearchableSelectOption) {
    onChange(option.value);
    closePicker(true);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-control border border-line bg-bg-elevated px-4 text-left text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
          "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
          disabled && "cursor-not-allowed opacity-60",
          !value && "text-ink-subtle",
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-required={required || undefined}
      >
        {selected?.leading}
        <span className="flex-1 truncate">{selected?.label ?? (value || placeholder)}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-[min(20rem,calc(100vw-2.5rem))] rounded-control border border-line bg-bg-elevated shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && filtered.length > 0) {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === "Enter" && filtered.length > 0) {
                  event.preventDefault();
                  choose(filtered[0]);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closePicker(true);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={`${id}-listbox`}
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            />
          </div>
          <div
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-64 overflow-auto py-1"
          >
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(option)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusOption(index + 1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (index === 0) inputRef.current?.focus();
                      else focusOption(index - 1);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      closePicker(true);
                    }
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-bg-muted focus:bg-bg-muted focus:outline-none",
                    isSelected && "bg-bg-muted",
                  )}
                >
                  {option.leading}
                  <span className="flex-1 truncate text-ink">{option.label}</span>
                  {isSelected && <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-subtle" role="status">
                No results found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
