import { Injectable } from '@nestjs/common';

export interface CapabilityQuery {
  capability: string;
  paths: string[];
}

/**
 * Generic connector adapter. Every vendor-specific nuance is expressed as
 * metadata (paths, field mappings) — no provider-specific code lives here.
 */
@Injectable()
export class ConnectorAdapterService {
  /**
   * Augments a record with a deterministic key used for change detection.
   * Falls back to a content hash when the connector does not provide ids.
   */
  stableKey(capability: string, record: Record<string, unknown>): string {
    const candidates = ['id', 'Id', 'ID', 'key', 'recordId', 'objectId', 'uuid'];
    for (const field of candidates) {
      const value = record[field];
      if (value !== undefined && value !== null) {
        return `${capability}:${String(value)}`;
      }
    }
    return `${capability}:${this.hash(JSON.stringify(record))}`;
  }

  /** Generic, deterministic field extraction on arbitrary connector records. */
  getString(record: Record<string, unknown>, fields: string[]): string | undefined {
    for (const field of fields) {
      const value = record[field];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          const display =
            (value as Record<string, unknown>)['name'] ??
            (value as Record<string, unknown>)['label'] ??
            (value as Record<string, unknown>)['value'];
          if (display !== undefined) return String(display);
          continue;
        }
        const s = String(value);
        if (s.length) return s;
      }
    }
    return undefined;
  }

  getNumber(
    record: Record<string, unknown>,
    fields: string[],
  ): number | undefined {
    for (const field of fields) {
      const value = record[field];
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') {
        const inner = (value as Record<string, unknown>)['value'];
        if (inner === undefined) continue;
        const n = Number(inner);
        if (Number.isFinite(n)) return n;
        continue;
      }
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  /** Candidate endpoint paths for a capability, in priority order. */
  getCapabilityPaths(capability: string): string[] {
    const norm = capability.toLowerCase();
    if (norm.includes('deal') || norm.includes('opportunit'))
      return [
        '/crm/v3/objects/deals',
        '/services/data/v61.0/query',
        '/deals',
        '/api/v1/deals',
        '/v1/crm/v3/objects/deals',
      ];
    if (norm.includes('contact') || norm.includes('person'))
      return [
        '/crm/v3/objects/contacts',
        '/contacts',
        '/api/v1/persons',
        '/v1/contacts',
      ];
    if (norm.includes('account') || norm.includes('company'))
      return [
        '/crm/v3/objects/companies',
        '/accounts',
        '/api/v1/organizations',
        '/v1/accounts',
      ];
    if (norm.includes('invoice') || norm.includes('subscription'))
      return [
        '/invoices',
        '/subscriptions',
        '/v1/invoices',
        '/api/v1/invoices',
      ];
    if (norm.includes('ticket'))
      return ['/api/v2/tickets', '/tickets', '/v2/tickets'];
    if (norm.includes('lead'))
      return ['/crm/v3/objects/leads', '/leads', '/api/v1/leads'];
    if (norm.includes('campaign') || norm.includes('conversion'))
      return ['/campaigns', '/v1/campaigns', '/metrics/campaigns'];
    return ['/records', '/items', '/'];
  }

  /**
   * Normalizes arbitrary connector payloads into a flat record array.
   * Understands output envelopes, paginated results and bare arrays.
   */
  extractRecords(payload: unknown): Array<Record<string, unknown>> {
    const results = new Map<string, Record<string, unknown>>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) this.visitItem(item, results);
        return;
      }
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        for (const key of ['outputs', 'value', 'results', 'entities', 'items', 'data']) {
          if (key in record) {
            visit(record[key]);
            return;
          }
        }
        if (
          Object.values(record).every(
            (v) => v === null || typeof v !== 'object' || Array.isArray(v),
          )
        ) {
          results.set(JSON.stringify(record), record);
        }
      }
    };
    visit(payload);
    return [...results.values()];
  }

  private visitItem(
    value: unknown,
    out: Map<string, Record<string, unknown>>,
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) this.visitItem(item, out);
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const payload = this.unwrap(record);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        out.set(JSON.stringify(payload), payload as Record<string, unknown>);
      }
    }
  }

  private unwrap(record: Record<string, unknown>): unknown {
    if ('outputs' in record && record.outputs !== undefined) {
      return record.outputs;
    }
    if ('value' in record && record.value !== undefined) {
      return record.value;
    }
    return record;
  }

  private hash(input: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
}