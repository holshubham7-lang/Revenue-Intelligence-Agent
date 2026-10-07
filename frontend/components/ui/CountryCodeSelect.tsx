"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, Search } from "lucide-react";

import { COUNTRIES, getDefaultCountry, type Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

type CountryCodeSelectProps = {
  /** Selected country's ISO 3166-1 alpha-2 code. */
  value: string;
  onChange: (country: Country) => void;
  id?: string;
  className?: string;
};

const SORTED_COUNTRIES = [...COUNTRIES].sort(
  (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name),
);

export function CountryCodeSelect({
  value,
  onChange,
  id = "country-code",
  className,
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = useMemo(
    () => COUNTRIES.find((country) => country.iso2 === value) ?? getDefaultCountry(),
    [value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SORTED_COUNTRIES;
    return SORTED_COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        country.dialCode.replace("+", "").includes(q) ||
        country.iso2.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
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
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]");
    if (!options?.length) return;
    options[(index + options.length) % options.length]?.focus();
  }

  function selectCountry(country: Country) {
    onChange(country);
    closePicker(true);
  }

  return (
    <div ref={containerRef} className={cn("relative shrink-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={cn(
          "flex h-12 w-[7.25rem] items-center gap-2 rounded-l-control border border-r-0 border-line bg-bg-elevated px-3 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
          "focus:z-10 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
        )}
        aria-label={"Country calling code: " + current.name + " " + current.dialCode}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id + "-listbox"}
      >
        <Image
          src={"https://flagcdn.com/w20/" + current.iso2 + ".png"}
          width={20}
          height={14}
          alt=""
          aria-hidden="true"
          className="rounded-sm"
        />
        <span className="text-sm font-medium">{current.dialCode}</span>
        <ChevronDown
          className={cn("size-4 text-ink-subtle transition-transform", open && "rotate-180")}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-[min(20rem,calc(100vw-2.5rem))] rounded-control border border-line bg-bg-elevated shadow-lg">
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
                  selectCountry(filtered[0]);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closePicker(true);
                }
              }}
              placeholder="Search country or code"
              aria-label="Search countries and calling codes"
              aria-controls={id + "-listbox"}
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            />
          </div>
          <div
            ref={listRef}
            id={id + "-listbox"}
            role="listbox"
            aria-label="Country calling codes"
            className="max-h-64 overflow-auto py-1"
          >
            {filtered.map((country, index) => {
              const selected = country.iso2 === current.iso2;
              return (
                <button
                  key={country.iso2}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectCountry(country)}
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
                    selected && "bg-bg-muted",
                  )}
                >
                  <Image
                    src={"https://flagcdn.com/w20/" + country.iso2 + ".png"}
                    width={20}
                    height={14}
                    alt=""
                    aria-hidden="true"
                    className="rounded-sm"
                  />
                  <span className="flex-1 truncate text-ink">{country.name}</span>
                  <span className="text-ink-muted">{country.dialCode}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-subtle" role="status">
                No countries found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
