import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthorizeUrlParams,
  ConnectorAccount,
  ConnectorAdapter,
  ExchangeCodeParams,
  OAuthTokenSet,
} from './connector.interface.js';

const AUTH_URL = 'https://app.hubspot.com/oauth/authorize';
const TOKEN_INFO_URL = 'https://api.hubapi.com/oauth/v1/access-tokens';

/**
 * HubSpot has versioned its OAuth token endpoint over time. Try the documented
 * v3 first, then fall back to the newer date-versioned and legacy v1 endpoints
 * so the adapter survives either roll-out state.
 */
const TOKEN_URLS = [
  'https://api.hubapi.com/oauth/v3/token',
  'https://api.hubapi.com/oauth/2026-03/token',
  'https://api.hubapi.com/oauth/v1/token',
];

/** Read-only CRM scopes; the HubSpot app must be configured with these. */
const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.companies.read',
  'crm.objects.deals.read',
  'crm.objects.owners.read',
];

/**
 * HubSpot OAuth2 adapter (Path B). RevOps owns the HubSpot app, so the OAuth
 * handshake no longer depends on Azure's managed connector app registration.
 */
@Injectable()
export class HubSpotAdapter implements ConnectorAdapter {
  private readonly logger = new Logger(HubSpotAdapter.name);

  constructor(private readonly config: ConfigService) {}

  readonly slug = 'hubspotcrm';
  readonly displayName = 'HubSpot';

  private clientId(): string {
    return this.config.get<string>('HUBSPOT_CLIENT_ID') ?? '';
  }

  private clientSecret(): string {
    return this.config.get<string>('HUBSPOT_CLIENT_SECRET') ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret());
  }

  scopes(): string[] {
    return SCOPES;
  }

  buildAuthorizeUrl({ state, redirectUri }: AuthorizeUrlParams): string {
    // HubSpot's documented flow is plain authorization-code + client secret;
    // it does not use PKCE, so no code_challenge is sent.
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode({
    code,
    redirectUri,
  }: ExchangeCodeParams): Promise<OAuthTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      redirect_uri: redirectUri,
      code,
    });
    return this.requestToken(body, 'authorization_code');
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      refresh_token: refreshToken,
    });
    return this.requestToken(body, 'refresh_token');
  }

  private async requestToken(
    body: URLSearchParams,
    flow: string,
  ): Promise<OAuthTokenSet> {
    let lastStatus = 0;
    let lastText = '';

    for (const url of TOKEN_URLS) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text().catch(() => '');
      if (response.ok) {
        const payload = JSON.parse(text) as {
          access_token?: string;
          refresh_token?: string;
          token_type?: string;
          expires_in?: number;
        };
        if (!payload.access_token) {
          throw new Error('HubSpot did not return an access token');
        }
        return {
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          tokenType: payload.token_type,
          expiresAt: payload.expires_in
            ? new Date(Date.now() + payload.expires_in * 1000)
            : undefined,
          scopes: SCOPES,
        };
      }
      lastStatus = response.status;
      lastText = text;
      // Only a missing endpoint warrants trying the next version; a 400/401
      // means the request itself was rejected and retrying won't help.
      if (response.status !== 404) break;
    }

    this.logger.error(
      `HubSpot ${flow} token request failed (${lastStatus}): ${lastText.slice(0, 300)}`,
    );
    throw new Error(`HubSpot token request failed (HTTP ${lastStatus})`);
  }

  async getAccount(accessToken: string): Promise<ConnectorAccount> {
    const response = await fetch(
      `${TOKEN_INFO_URL}/${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) {
      this.logger.warn(
        `HubSpot token-info lookup failed (HTTP ${response.status}); storing connection without account name`,
      );
      return {};
    }
    const payload = (await response.json()) as {
      hub_id?: number;
      hub_domain?: string;
      user?: string;
      user_id?: number;
    };
    return {
      id: payload.hub_id ? String(payload.hub_id) : undefined,
      name: payload.hub_domain,
      email: payload.user,
    };
  }
}
