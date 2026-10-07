"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { postJson } from "@/lib/api/csrf-client";
import type { CompanyFormValues } from "@/lib/contracts";
import { company, toasts } from "@/lib/content";
import { cn } from "@/lib/utils";
import { CountryCodeSelect } from "@/components/ui/CountryCodeSelect";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { COUNTRIES, parsePhoneNumber } from "@/lib/countries";

/** Native select styled to match the text inputs, with a custom chevron. */
function SelectField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-negative"> *</span>}
      </label>
      <div className="relative">
        <select
          id={id}
          name={id}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-12 w-full appearance-none rounded-control border border-line bg-bg-elevated px-4 pr-10 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
            !value && "text-ink-subtle",
            "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25",
          )}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option} value={option} className="text-ink">
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function SearchableField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <SearchableSelect
        id={id}
        value={value}
        options={options.map((option) => ({ value: option, label: option }))}
        placeholder={placeholder}
        searchPlaceholder={`Search ${label.toLowerCase()}`}
        ariaLabel={`Select ${label.toLowerCase()}`}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Company registration form (the `/company` route). Content-driven, guarded by
 * a double-submit CSRF token, and talks to the `/api/companies` seam.
 *
 * `mode="edit"` reuses the exact same markup and endpoint — the API upserts on
 * `userId` — but seeds the fields from `initialValues`, swaps the submit copy
 * for save/cancel, and hands control back to `onSaved` instead of routing to
 * the chat workspace.
 */
export function CompanyForm({
  initialValues,
  mode = "create",
  onSaved,
  onCancel,
}: {
  initialValues?: CompanyFormValues;
  mode?: "create" | "edit";
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = mode === "edit";
  const [companyName, setCompanyName] = useState(initialValues?.companyName ?? "");
  const [website, setWebsite] = useState(initialValues?.website ?? "");
  const [industry, setIndustry] = useState(initialValues?.industry ?? "");
  const [companySize, setCompanySize] = useState(initialValues?.companySize ?? "");
  const [companyType, setCompanyType] = useState(initialValues?.companyType ?? "");
  const [country, setCountry] = useState(initialValues?.country ?? "");
  const [state, setState] = useState(initialValues?.state ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "");
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [phone, setPhone] = useState(() => parsePhoneNumber(initialValues?.phone));
  const [revenueRange, setRevenueRange] = useState(initialValues?.revenueRange ?? "");
  const [problem, setProblem] = useState(initialValues?.problem ?? "");

  const initialPhoneRef = useRef(initialValues?.phone);
  useEffect(() => {
    if (initialPhoneRef.current === initialValues?.phone) return;
    initialPhoneRef.current = initialValues?.phone;
    setPhone(parsePhoneNumber(initialValues?.phone));
  }, [initialValues?.phone]);

  const selectedCountry = COUNTRIES.find((item) => item.name === country);

  useEffect(() => {
    if (!selectedCountry) {
      setStates([]);
      setStatesLoading(false);
      return;
    }
    const controller = new AbortController();
    setStatesLoading(true);
    fetch(`/api/locations/states?country=${selectedCountry.iso2}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load states");
        return (await response.json()) as { states: string[] };
      })
      .then((data) => setStates(data.states))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setStates([]);
      })
      .finally(() => { if (!controller.signal.aborted) setStatesLoading(false); });
    return () => controller.abort();
  }, [selectedCountry?.iso2]);

  useEffect(() => {
    if (!selectedCountry || !state) {
      setCities([]);
      setCitiesLoading(false);
      return;
    }
    const controller = new AbortController();
    setCitiesLoading(true);
    const params = new URLSearchParams({ country: selectedCountry.iso2, state });
    fetch(`/api/locations/cities?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load cities");
        return (await response.json()) as { cities: string[] };
      })
      .then((data) => setCities(data.cities))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setCities([]);
      })
      .finally(() => { if (!controller.signal.aborted) setCitiesLoading(false); });
    return () => controller.abort();
  }, [selectedCountry?.iso2, state]);

  const [, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { form } = company;
  const { toast } = useToast();

  const submitLabel = editing ? form.save : form.submit;
  const busyLabel = editing ? form.saving : form.submitting;

  const problemWordCount = useMemo(
    () => (problem.trim() ? problem.trim().split(/\s+/).length : 0),
    [problem],
  );
  const problemOverLimit = problemWordCount > form.problem.maxWords;

  function showError(message: string) {
    setFormError(message);
    toast({ title: toasts.company.error, description: message, variant: "error" });
  }

  /**
   * Labels of the required fields this submit left empty, in field order.
   *
   * Checked here rather than only by the API so the alert can name the fields
   * in the same words the form labels them with — a generic "please fix the
   * highlighted fields" is useless when nothing is highlighted.
   */
  function missingLabels(): string[] {
    const missing: string[] = [];
    if (!companyName.trim()) missing.push(form.companyName.label);
    if (!companyType) missing.push(form.companyType.label);
    if (!country.trim()) missing.push(form.country.label);
    if (!phone.number.trim()) missing.push(form.phone.label);
    return missing;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || problemOverLimit) return;

    const missing = missingLabels();
    if (missing.length > 0) {
      showError(`${form.errors.requiredPrefix} ${missing.join(", ")}.`);
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await postJson("/api/companies", {
        companyName: companyName.trim(),
        website: website.trim(),
        industry,
        companySize,
        companyType,
        country: country.trim(),
        state: state.trim(),
        city: city.trim(),
        phone: `${phone.countryCode}${phone.number}`.replace(/[^+\d]/g, ""),
        revenueRange,
        problem: problem.trim(),
      });
      if (!res.ok) {
        let message: string | null = null;
        try {
          const data = (await res.json()) as {
            error?: { message?: string; fields?: Record<string, string> };
          };
          /* A 422 carries one message per field, each led by the field name, so
             they say exactly what to fix without decoding a generic banner. */
          const perField = Object.values(data.error?.fields ?? {});
          message =
            perField.length > 0 ? perField.join(" ") : (data.error?.message ?? null);
        } catch {
          // no JSON body to read — fall through to the generic message
        }
        throw new Error(message ?? "request_failed");
      }
      if (editing) {
        // Re-read the server component so the read-only view shows the new
        // values, then leave edit mode.
        toast({ ...toasts.company.updated, variant: "success" });
        onSaved?.();
        router.refresh();
      } else {
        /* Company saved — straight to the chat. The upload used to be a separate
           step between here and the assistant, so a company that registered was
           told to go and find a file before it could ask anything. Upload is now
           something the chat offers, so registration ends where the work happens
           and the first screen explains what to share. */
        toast({ ...toasts.company.created, variant: "success" });
        router.push("/chat");
      }
    } catch (err) {
      const sentinels = new Set(["request_failed", "csrf_failed"]);
      const msg = err instanceof Error ? err.message : "";
      showError(
        sentinels.has(msg) || msg === ""
          ? fetchError ?? form.errors.server
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fetchError =
    typeof navigator !== "undefined" && !navigator.onLine
      ? form.errors.network
      : form.errors.server;

  const fieldClass = cn(
    "h-12 w-full rounded-control border border-line bg-bg-elevated px-4 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
    "placeholder:text-ink-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25",
  );

  const submitButton = (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className={editing ? "w-full sm:w-auto" : "mt-6 w-full"}
      disabled={submitting || problemOverLimit}
    >
      {submitting ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        submitLabel
      )}
    </Button>
  );

  return (
    <div className="relative w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm sm:p-8"
      >
        <fieldset disabled={submitting} className="space-y-5">
          <legend className="font-display text-lg font-bold tracking-tight text-ink">
            {editing ? form.editLegend : form.legend}
          </legend>

          <div className="grid gap-5 sm:grid-cols-2">
            <h2 className="sm:col-span-2 border-b border-line pb-2 font-display text-base font-semibold text-ink">
              Company details
            </h2>

            {/* Company name */}
            <div className="sm:col-span-2">
              <label htmlFor="companyName" className="mb-1.5 block text-sm font-semibold text-ink">
                {form.companyName.label}
                <span className="text-negative"> *</span>
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={form.companyName.placeholder}
                className={fieldClass}
              />
              <p id="companyName-hint" className="mt-1.5 text-sm text-ink-subtle">
                {form.companyName.hint}
              </p>
            </div>

            {/* Website (optional) */}
            <div className="sm:col-span-2">
              <label htmlFor="website" className="mb-1.5 block text-sm font-semibold text-ink">
                {form.website.label}
              </label>
              <input
                id="website"
                name="website"
                type="url"
                autoComplete="url"
                inputMode="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={form.website.placeholder}
                className={fieldClass}
              />
              <p id="website-hint" className="mt-1.5 text-sm text-ink-subtle">
                {form.website.hint}
              </p>
            </div>

            {/* Company type (required) + industry */}
            <SelectField
              id="companyType"
              label={form.companyType.label}
              placeholder={form.companyType.placeholder}
              options={form.companyType.options}
              value={companyType}
              onChange={setCompanyType}
              required
            />
            <SelectField
              id="industry"
              label={form.industry.label}
              placeholder={form.industry.placeholder}
              options={form.industry.options}
              value={industry}
              onChange={setIndustry}
            />

            {/* Company size + annual revenue range */}
            <SelectField
              id="companySize"
              label={form.companySize.label}
              placeholder={form.companySize.placeholder}
              options={form.companySize.options}
              value={companySize}
              onChange={setCompanySize}
            />
            <SelectField
              id="revenueRange"
              label={form.revenueRange.label}
              placeholder={form.revenueRange.placeholder}
              options={form.revenueRange.options}
              value={revenueRange}
              onChange={setRevenueRange}
            />

            <h2 className="sm:col-span-2 border-b border-line pb-2 font-display text-base font-semibold text-ink">
              Location and contact
            </h2>

            {/* Country is required; State and City follow as optional fields. */}
            <div className="sm:col-span-2">
              <label htmlFor="country" className="mb-1.5 block text-sm font-semibold text-ink">
                {form.country.label}
                <span className="text-negative"> *</span>
              </label>
              <SearchableSelect
                id="country"
                value={country}
                options={[
                  ...(country && !COUNTRIES.some((item) => item.name === country)
                    ? [{ value: country, label: country }]
                    : []),
                  ...COUNTRIES.map((item) => ({
                    value: item.name,
                    label: item.name,
                    searchText: item.iso2,
                  })),
                ]}
                placeholder={form.country.placeholder}
                searchPlaceholder="Search countries"
                ariaLabel="Select country"
                required
                onChange={(value) => {
                  setCountry(value);
                  setState("");
                  setCity("");
                  setCities([]);
                }}
              />
            </div>
            {/* State + city (both optional, dependent on the previous selection) */}
            <SearchableField
              id="state"
              label={form.state.label}
              placeholder={statesLoading ? "Loading states…" : form.state.placeholder}
              options={state && !states.includes(state) ? [state, ...states] : states}
              value={state}
              onChange={(value) => {
                setState(value);
                setCity("");
              }}
              disabled={!selectedCountry || statesLoading || (states.length === 0 && !state)}
            />
            <SearchableField
              id="city"
              label={form.city.label}
              placeholder={citiesLoading ? "Loading cities…" : form.city.placeholder}
              options={city && !cities.includes(city) ? [city, ...cities] : cities}
              value={city}
              onChange={setCity}
              disabled={!state || citiesLoading || (cities.length === 0 && !city)}
            />

            <div className="sm:col-span-2">
              <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold text-ink">
                {form.phone.label}
                <span className="text-negative"> *</span>
              </label>
              <div className="flex">
                <CountryCodeSelect
                  id="phone-country-code"
                  value={phone.countryIso2}
                  onChange={(selected) =>
                    setPhone((current) => ({
                      ...current,
                      countryIso2: selected.iso2,
                      countryCode: selected.dialCode,
                    }))
                  }
                />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel-national"
                  aria-describedby="phone-hint"
                  value={phone.number}
                  onChange={(e) =>
                    setPhone((current) => ({
                      ...current,
                      number: e.target.value.replace(/[^0-9]/g, ""),
                    }))
                  }
                  placeholder={form.phone.placeholder}
                  className={cn(
                    fieldClass,
                    "min-w-0 flex-1 rounded-l-none rounded-r-control border-l-0 focus:z-10",
                  )}
                />
              </div>
              <p id="phone-hint" className="mt-1.5 text-sm text-ink-subtle">
                {form.phone.hint}
              </p>
            </div>

            <h2 className="sm:col-span-2 border-b border-line pb-2 font-display text-base font-semibold text-ink">
              Additional details
            </h2>

            {/* Problem description / query */}
            <div className="sm:col-span-2">
              <label htmlFor="problem" className="mb-1.5 block text-sm font-semibold text-ink">
                {form.problem.label}
              </label>
              <textarea
                id="problem"
                name="problem"
                rows={5}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder={form.problem.placeholder}
                className={cn(
                  fieldClass,
                  "h-auto min-h-32 resize-y py-3 leading-relaxed",
                  problemOverLimit && "border-negative focus:border-negative focus:ring-negative/25",
                )}
              />
              <p
                className={cn(
                  "mt-1.5 text-sm",
                  problemOverLimit ? "font-medium text-negative" : "text-ink-subtle",
                )}
              >
                {form.problem.hint} · {problemWordCount}
                {problemOverLimit
                  ? ` > ${form.problem.maxWords}`
                  : ` / ${form.problem.maxWords}`}
              </p>
            </div>
          </div>
        </fieldset>

        {editing ? (
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={onCancel}
              disabled={submitting}
            >
              {form.cancel}
            </Button>
            {submitButton}
          </div>
        ) : (
          submitButton
        )}
      </form>
    </div>
  );
}
