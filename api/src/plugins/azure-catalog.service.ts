import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import { PLUGIN_SEED_DATA } from './plugin-seed.data.js';
import { PluginResponse } from './dto/plugins-response.dto.js';

const MANAGED_APIS_URL =
  'https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Web/locations/{location}/managedApis?api-version=2016-06-01';

const SUBSCRIPTIONS_URL =
  'https://management.azure.com/subscriptions?api-version=2020-01-01';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const BRAND_PALETTE = [
  '#34744e',
  '#0f6cbd',
  '#8a2be2',
  '#c0563c',
  '#b83280',
  '#2563eb',
  '#047857',
  '#be185d',
  '#7c2d12',
  '#4d7c0f',
];

interface ManagedApiConnectionParameters {
  [key: string]: {
    type?: string;
    oAuthSettings?: {
      scopes?: string[];
    };
  };
}

interface ManagedApiItem {
  name?: string;
  properties?: {
    connectionParameters?: ManagedApiConnectionParameters;
    metadata?: {
      brandColor?: string;
    };
    generalInformation?: {
      displayName?: string;
      description?: string;
      iconUrl?: string;
    };
  };
}

interface CatalogSnapshot {
  fetchedAt: number;
  items: PluginResponse[];
  source: 'azure' | 'fallback';
}

@Injectable()
export class AzureCatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AzureCatalogService.name);
  private readonly credential = new DefaultAzureCredential();
  private snapshot: CatalogSnapshot | null = null;
  private fetchPromise: Promise<CatalogSnapshot> | null = null;
  private subscriptionId: string | undefined;

  async onApplicationBootstrap(): Promise<void> {
    // Warm the catalog in the background so the first marketplace request is fast.
    this.getConnectors().catch((error) => {
      this.logger.warn(
        `Background catalog refresh failed: ${(error as Error).message}`,
      );
    });
  }

  /** Returns the live connector catalog (OAuth2 connectors only), cached. */
  async getConnectors(): Promise<PluginResponse[]> {
    const snapshot = await this.ensureFreshSnapshot();
    return snapshot.items;
  }

  getLastResult(): CatalogSnapshot | null {
    return this.snapshot;
  }

  private async ensureFreshSnapshot(): Promise<CatalogSnapshot> {
    const now = Date.now();
    if (this.snapshot && now - this.snapshot.fetchedAt < CACHE_TTL_MS) {
      return this.snapshot;
    }
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    const task = this.fetchCatalog().finally(() => {
      this.fetchPromise = null;
    });
    this.fetchPromise = task;
    return task;
  }

  private async fetchCatalog(): Promise<CatalogSnapshot> {
    try {
      const subscriptionId = await this.resolveSubscriptionId();
      const token = await this.credential.getToken(
        'https://management.azure.com/.default',
      );
      const location = process.env.AZURE_CATALOG_LOCATION ?? 'centralus';

      const url = MANAGED_APIS_URL.replace(
        '{subscriptionId}',
        subscriptionId,
      ).replace('{location}', location);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token?.token ?? ''}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `Azure managedApis catalog returned ${response.status}: ${body.slice(0, 300)}`,
        );
      }

      const payload = (await response.json()) as {
        value?: ManagedApiItem[];
      };
      const items = this.mapCatalog(payload.value ?? []);
      if (items.length === 0) {
        throw new Error('Azure catalog returned zero OAuth2 connectors');
      }

      this.logger.log(
        `Loaded ${items.length} OAuth2 connectors from the Azure connector catalog (${location}).`,
      );
      this.snapshot = { fetchedAt: Date.now(), items, source: 'azure' };
      return this.snapshot;
    } catch (error) {
      this.logger.warn(
        `Unable to refresh Azure connector catalog (using fallback list): ${
          (error as Error).message
        }`,
      );
      const fallback: PluginResponse[] = PLUGIN_SEED_DATA.map((seed) => ({
        slug: seed.slug as string,
        name: seed.name as string,
        description: seed.description,
        category: String(seed.category),
        mark: seed.mark,
        brandColor: seed.brandColor,
        source: 'foundry',
        authType: 'oauth2',
        scopes: seed.scopes ?? [],
        enabled: true,
        sortOrder: seed.sortOrder ?? 100,
      }));
      this.snapshot = { fetchedAt: Date.now(), items: fallback, source: 'fallback' };
      return this.snapshot;
    }
  }

  private async resolveSubscriptionId(): Promise<string> {
    if (this.subscriptionId) return this.subscriptionId;

    if (process.env.AZURE_SUBSCRIPTION_ID) {
      this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID.trim();
      return this.subscriptionId;
    }

    const token = await this.credential.getToken(
      'https://management.azure.com/.default',
    );
    const response = await fetch(SUBSCRIPTIONS_URL, {
      headers: {
        Authorization: `Bearer ${token?.token ?? ''}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(
        `Unable to resolve Azure subscription: HTTP ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      value?: Array<{ subscriptionId?: string }>;
    };
    const sub = payload.value?.[0]?.subscriptionId;
    if (!sub) {
      throw new Error('No accessible Azure subscription found');
    }
    this.subscriptionId = sub;
    return sub;
  }

  private mapCatalog(items: ManagedApiItem[]): PluginResponse[] {
    const connectors = items.filter((item) => this.isOAuth2(item));

    const sorted = [...connectors].sort((a, b) => {
      const nameA = a.name ?? '';
      const nameB = b.name ?? '';
      return nameA.localeCompare(nameB);
    });

    return sorted.map((item, index) =>
      this.toPluginResponse(item, index),
    );
  }

  private isOAuth2(item: ManagedApiItem): boolean {
    const params = item.properties?.connectionParameters;
    if (!params) return false;
    return Object.values(params).some(
      (param) => param?.type === 'oauthSetting',
    );
  }

  private toPluginResponse(item: ManagedApiItem, index: number): PluginResponse {
    const props = item.properties ?? {};
    const general = props.generalInformation ?? {};
    const slug = item.name ?? `connector-${index}`;
    const rawName = general.displayName || slug;
    const name = rawName.replace(/\s*\(Independent Publisher\)\s*$/i, '').trim();
    const description = general.description ?? '';
    const category = this.categorize(name, description);
    const brandColor =
      props.metadata?.brandColor ??
      BRAND_PALETTE[index % BRAND_PALETTE.length];

    return {
      slug,
      name: name || slug,
      description: description || undefined,
      category,
      mark: this.initials(name || slug),
      brandColor,
      source: 'foundry',
      authType: 'oauth2',
      scopes: this.collectScopes(props.connectionParameters),
      enabled: true,
      sortOrder: index,
      iconUrl: general.iconUrl,
    };
  }

  private collectScopes(
    params?: ManagedApiConnectionParameters,
  ): string[] | undefined {
    if (!params) return undefined;
    const scopes = new Set<string>();
    for (const param of Object.values(params)) {
      if (param?.type === 'oauthSetting' && Array.isArray(param.oAuthSettings?.scopes)) {
        for (const scope of param.oAuthSettings.scopes) {
          const normalized = (scope ?? '').trim();
          if (normalized) scopes.add(normalized);
        }
      }
    }
    return scopes.size > 0 ? [...scopes] : undefined;
  }

  private initials(name: string): string {
    const words = name
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word))
      .slice(0, 2);
    if (words.length === 0) return 'PL';
    return words.map((word) => word[0].toUpperCase()).join('');
  }

  private categorize(name: string, description: string): string {
    const haystack = `${name} ${description}`.toLowerCase();

    if (/\b(crm|sales|pipeline|deals|opportunit|lead|account)\b/.test(haystack)) {
      return 'crm';
    }
    if (/\b(marketing|email|campaign|newsletter|ads?|social)\b/.test(haystack)) {
      return 'marketing';
    }
    if (/\b(support|helpdesk|ticket|help desk|chatbot|service desk)\b/.test(haystack)) {
      return 'support';
    }
    if (/\b(analytics|data|insights|report|dashboard|warehouse|bi |database|storage)\b/.test(haystack)) {
      return 'data';
    }
    return 'product';
  }
}