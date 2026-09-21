import { Injectable } from '@nestjs/common';
import { ConnectorAdapter } from './connector.interface.js';
import { HubSpotAdapter } from './hubspot.adapter.js';

/**
 * Maps catalog slugs to Path B adapters. Slugs not present here fall back to
 * the Azure managed-connector flow (Path A).
 */
@Injectable()
export class ConnectorRegistry {
  private readonly adapters = new Map<string, ConnectorAdapter>();

  constructor(hubspot: HubSpotAdapter) {
    this.register('hubspotcrm', hubspot);
  }

  private register(slug: string, adapter: ConnectorAdapter): void {
    this.adapters.set(slug, adapter);
  }

  get(slug: string): ConnectorAdapter | undefined {
    return this.adapters.get(slug);
  }

  has(slug: string): boolean {
    return this.adapters.has(slug);
  }
}
