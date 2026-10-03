/**
 * The canonical shape every upload is normalised into, plus the header synonym
 * dictionary that gets raw CRM columns onto it.
 *
 * This is deliberately the same normalised record the v1.0 API stores in
 * `revenue_entities` (`entityType`, `sourceKey`, `name`, `amount`, `currency`,
 * `status`, `stage`, `rawDate`), so an uploaded CSV and a future HubSpot
 * connection produce identical downstream records and the analysis agent
 * cannot tell them apart.
 *
 * Column matching is the hard part of ingestion, not parsing. CRM exports call
 * the same field `Amount`, `Deal Value`, `ARR`, and `Pipeline Value`, and they
 * distinguish `Close Date` from `Closed Won Date` — mapping those wrong is
 * worse than refusing the file, because every finding downstream is then
 * confidently wrong. So mapping is:
 *
 *   1. exact match on a canonical name
 *   2. synonym match, normalised
 *   3. left unmapped — reported to the user for confirmation
 *
 * Nothing is guessed silently. `proposeMapping` returns candidates with a
 * confidence; the UI confirms before anything is committed.
 */

/** Record types we recognise. An upload of deals maps to `deal`. */
export type EntityType = "deal" | "contact" | "company" | "activity" | "invoice" | "ticket";

export type CanonicalRecord = {
  entityType: EntityType;
  /** Stable dedupe key within the file — the best available id column. */
  sourceKey: string;
  /**
   * Non-null by construction: a row with no name is dropped during
   * normalisation, because a record that cannot be referenced by name is not
   * something a user could act on in an action plan.
   */
  name: string;
  /** Null when the value was absent or unreadable — never coerced to 0. */
  amount: number | null;
  currency: string | null;
  status: string | null;
  stage: string | null;
  /** ISO date, or null when absent or unreadable. */
  rawDate: string | null;
};

/** Canonical field a column may be mapped onto. */
export const CANONICAL_FIELDS = [
  "entityType",
  "sourceKey",
  "name",
  "amount",
  "currency",
  "status",
  "stage",
  "date",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/**
 * Header synonyms per field. Lower-cased and stripped of non-alphanumerics
 * before lookup, so `Deal Value`, `DEAL_VALUE`, and `deal value` all collapse
 * to `dealvalue` and hit the same entry.
 *
 * Two families of synonym live here. The first is CRM-shaped — the same deal
 * export from four CRMs. The second is report-shaped: the four report families
 * the product asks users to share (sales, marketing, operations, customer
 * success) are almost never row-per-deal. A channel-performance export labels its
 * rows `Channel`, a churn export labels them `Account` and `Churn Reason`, and a
 * cycle-time export labels them `Stage` and `Cycle Time`. Without these the file
 * lands in the mapping screen with nothing proposed, and the required row-label
 * field looks unfillable even though the user can see exactly which column to pick.
 *
 * None of this is applied silently — every proposal is confirmed in the UI, so a
 * synonym that turns out to be wrong costs a dropdown, not a wrong plan.
 */
const SYNONYMS: Readonly<Record<CanonicalField, readonly string[]>> = {
  entityType: ["type", "recordtype", "objecttype", "entitytype", "kind"],
  sourceKey: [
    "id",
    "recordid",
    "dealid",
    "opportunityid",
    "contactid",
    "companyid",
    "accountid",
    "ticketid",
    "dealnameid",
    "uniqueid",
    "guid",
    "key",
    "crmid",
  ],
  name: [
    "name",
    "dealname",
    "deal",
    "opportunityname",
    "opportunity",
    "subject",
    "title",
    "accountname",
    "companyname",
    "company",
    "organisation",
    "organization",
    "business",
    "businessname",
    "fullname",
    "contactname",
    // Report-shaped: the label each row is about.
    "account",
    "customer",
    "customername",
    "client",
    "clientname",
    "prospect",
    "segment",
    "channel",
    "campaign",
    "category",
    "product",
    "region",
    "territory",
    "team",
    "owner",
    "metric",
    "metricname",
    "reportname",
    "kpi",
  ],
  amount: [
    "amount",
    "dealvalue",
    "dealvalueusd",
    "value",
    "pipelinevalue",
    "pipeline",
    "arr",
    "acv",
    "tcv",
    "mrr",
    "revenue",
    "closedamount",
    "salesprice",
    "price",
    // Report-shaped: what the leakage is measured in.
    "spend",
    "adspend",
    "marketingspend",
    "budget",
    "cost",
    "costs",
    "costofgoods",
    "ltv",
    "lifetimevalue",
    "netrevenue",
    "grossrevenue",
    "expansion",
    "expansionrevenue",
    "churnedrevenue",
    "lostrevenue",
    "atriskvalue",
    "renewalvalue",
    "contractvalue",
    "cycletime",
    "daysinstage",
  ],
  currency: ["currency", "currencycode", "curr", "isocurrency"],
  status: [
    "status",
    "dealstatus",
    "iswon",
    "won",
    "lost",
    "closed",
    "open",
    // Report-shaped: how a row is doing.
    "health",
    "accounthealth",
    "renewalstatus",
    "churnreason",
    "churned",
    "atrisk",
    "outcome",
    "result",
  ],
  stage: [
    "stage",
    "dealstage",
    "pipeline stage",
    "salesstage",
    "stageName",
    "phase",
    "funnelstage",
    "lifestagestage",
    "lifecycle",
    "step",
  ],
  date: [
    "date",
    "closedate",
    "closedate",
    "expectedclosedate",
    "createdate",
    "create date",
    "created",
    "won date",
    "closedwondate",
    "closedlostdate",
    "lastactivitydate",
    "lastmodifieddate",
    "modifieddate",
    "updatedat",
    // Event-shaped: an extract that logs what happened, rather than a deal.
    "eventdate",
    "activitydate",
    "transactiondate",
    "orderdate",
    "invoicedate",
    "duedate",
    "occurreddate",
    "daterecorded",
    "recordeddate",
    "reportdate",
    "timestamp",
    "datetime",
    // Report-shaped: when the report is about.
    "renewaldate",
    "churndate",
    "startdate",
    "enddate",
    "contractstart",
    "golive",
    "onboardingdate",
    "cohort",
    "cohortdate",
    "period",
    "fiscalperiod",
    "month",
    "quarter",
    "week",
  ],
};

/**
 * Which date column we want, in priority order. Deliberately prefers an
 * *expected* close date: a plan built on won-lost history cannot see open
 * pipeline, which is most of what a RevOps review is about.
 *
 * Report-shaped dates rank below the CRM ones because a retention report has no
 * close date at all — if one is present it is `Renewal date`, and preferring that
 * over a generic `Date` column is the only ranking that helps.
 */
const DATE_PRIORITY = [
  "closedate",
  "expectedclosedate",
  "won date",
  "closedwondate",
  "createdate",
  "created",
  "lastactivitydate",
  "lastmodifieddate",
  "modifieddate",
  "renewaldate",
  "churndate",
  "updatedat",
  "date",
] as const;

/**
 * Which amount column we want, in priority order. Deal value beats ARR.
 *
 * Leakage measures sit below the CRM values deliberately: a report that carries
 * both `Deal value` and `Spend` is describing two different populations, and
 * picking the one a pipeline review is built on is the safer default. The
 * ambiguity is surfaced to the user either way.
 */
const AMOUNT_PRIORITY = [
  "amount",
  "dealvalue",
  "dealvalueusd",
  "closedamount",
  "pipelinevalue",
  "tcv",
  "value",
  "arr",
  "acv",
  "mrr",
  "revenue",
  "netrevenue",
  "grossrevenue",
  "ltv",
  "lifetimevalue",
  "contractvalue",
  "renewalvalue",
  "atriskvalue",
  "expansionrevenue",
  "churnedrevenue",
  "lostrevenue",
  "salesprice",
  "price",
  "spend",
  "adspend",
  "marketingspend",
  "budget",
  "cost",
  "costs",
] as const;

/**
 * Normalises a header for lookup: lower-case, strip everything that is not a
 * letter or digit, collapse runs. `Deal Value (USD)` → `dealvalueusd`.
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function synonymIndex(): Map<string, CanonicalField> {
  const index = new Map<string, CanonicalField>();
  for (const field of CANONICAL_FIELDS) {
    index.set(normalizeHeader(field), field);
    for (const synonym of SYNONYMS[field]) {
      const key = normalizeHeader(synonym);
      if (!index.has(key)) index.set(key, field);
    }
  }
  return index;
}

export type ColumnProposal = {
  /** Original header, verbatim, so the UI can echo it back. */
  header: string;
  /** Canonical field this column would map to, or null if unmapped. */
  field: CanonicalField | null;
  /** 1 = exact canonical match, 0.9 = synonym, 0 = no candidate. */
  confidence: number;
  /** True when several source columns compete for one field. */
  ambiguous: boolean;
};

export type MappingProposal = {
  entityType: EntityType;
  columns: ColumnProposal[];
  /** Canonical fields no column covers — these become agent questions. */
  missing: CanonicalField[];
  /** Usable once every required field has a column. */
  mappable: boolean;
};

/**
 * Required for a record to exist at all; the rest degrade gracefully.
 *
 * `amount` is deliberately not here. An event log, a headcount sheet or a
 * company extract has no value column and never will, and refusing it means the
 * user cannot share the report they actually have. What is lost is bounded and
 * visible: `amountSum` stays 0, `nullCounts.amount` equals the record count, and
 * `buildDatasetContext` turns that into the caveat "…has no value column filled
 * in", so the questions and the plan know the money side is absent rather than
 * silently reading a total of zero as a real one.
 *
 * `name` stays required — a row that cannot be referred to cannot be acted on.
 */
const REQUIRED: readonly CanonicalField[] = ["name"];

/** Fields where a lower priority rank beats a higher one. */
const RANKED_FIELDS = new Set<CanonicalField>(["amount", "date"]);

/** Canonical-form key for a header, used to consult the priority tables. */
export function priorityRank(field: CanonicalField, header: string): number {
  const key = normalizeHeader(header);
  const table = field === "date" ? DATE_PRIORITY : field === "amount" ? AMOUNT_PRIORITY : [];
  const rank = (table as readonly string[]).indexOf(key);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

/**
 * Infers an entity type from the headers present. Deal-shaped sheets carry an
 * amount plus a stage; contact sheets carry an email; company sheets carry a
 * domain. Defaults to `deal` because that is what a RevOps upload almost always
 * is, and the user confirms it before anything is committed.
 *
 * Report-shaped sheets fall through to `deal` on purpose. A channel-performance
 * or churn export is an aggregate, not an entity, and there is no accurate type
 * to give it — guessing `company` for a churn report because it has an `Account`
 * column would be confidently wrong in a way the user has no way to spot from
 * the UI.
 */
export function inferEntityType(headers: readonly string[]): EntityType {
  const normalized = new Set(headers.map(normalizeHeader));
  const has = (...keys: string[]) => keys.some((k) => normalized.has(normalizeHeader(k)));

  if (has("email", "emailaddress")) return "contact";
  if (has("domain", "website", "accountdomain")) return "company";
  if (has("ticketid", "casenumber", "incident")) return "ticket";
  if (has("invoice", "invoicenumber", "duedate")) return "invoice";
  if (has("subjectline", "activitytype", "taskdescription")) return "activity";
  return "deal";
}

/** The canonical field a header would map to, with its confidence tier. */
function candidateFor(header: string, index: Map<string, CanonicalField>): {
  field: CanonicalField | null;
  confidence: number;
} {
  const key = normalizeHeader(header);
  if (key.length === 0) return { field: null, confidence: 0 };

  const canonical = (CANONICAL_FIELDS as readonly string[]).find((f) => normalizeHeader(f) === key);
  if (canonical) return { field: canonical as CanonicalField, confidence: 1 };

  const viaSynonym = index.get(key);
  if (viaSynonym) return { field: viaSynonym, confidence: 0.9 };

  return { field: null, confidence: 0 };
}

/**
 * Proposes a column → canonical-field mapping for a header row.
 *
 * Returns candidates rather than a decision. Every proposal must be confirmed
 * by the user before rows are normalised, because a wrong `date` or `amount`
 * mapping produces findings that look authoritative and are not.
 *
 * Columns that map to the same canonical field are all reported — the winner
 * gets `ambiguous: false`, the rest `ambiguous: true` with a lower confidence, so
 * the UI can show "you have both `Amount` and `ARR`; which is the deal value?"
 * instead of silently discarding one.
 */
export function proposeMapping(
  headers: readonly string[],
  entityType?: EntityType,
): MappingProposal {
  const type = entityType ?? inferEntityType(headers);
  const index = synonymIndex();

  const candidates = headers.map((header) => ({ header, ...candidateFor(header, index) }));

  /** Winning column index per canonical field. */
  const winner = new Map<CanonicalField, number>();
  /** Best priority rank seen per field, to let a stronger column displace a weaker one. */
  const bestRank = new Map<CanonicalField, number>();

  candidates.forEach((candidate, i) => {
    if (!candidate.field) return;
    const { field } = candidate;
    const rank = RANKED_FIELDS.has(field) ? priorityRank(field, candidate.header) : 0;

    if (!winner.has(field)) {
      winner.set(field, i);
      bestRank.set(field, rank);
      return;
    }

    // A ranked field is displaceable by a strictly better column; everything
    // else keeps the first column that claimed it.
    if (RANKED_FIELDS.has(field) && rank < (bestRank.get(field) ?? Number.MAX_SAFE_INTEGER)) {
      winner.set(field, i);
      bestRank.set(field, rank);
    }
  });

  const columns: ColumnProposal[] = candidates.map((candidate, i) => {
    if (!candidate.field) {
      return { header: candidate.header, field: null, confidence: 0, ambiguous: false };
    }

    if (winner.get(candidate.field) === i) {
      return { header: candidate.header, field: candidate.field, confidence: candidate.confidence, ambiguous: false };
    }

    // Lost the field, but still recognises it — surface it for confirmation.
    return {
      header: candidate.header,
      field: candidate.field,
      confidence: Math.min(candidate.confidence, 0.6),
      ambiguous: true,
    };
  });

  const missing = CANONICAL_FIELDS.filter((field) => !winner.has(field));

  return {
    entityType: type,
    columns,
    missing,
    mappable: REQUIRED.every((field) => winner.has(field)),
  };
}
