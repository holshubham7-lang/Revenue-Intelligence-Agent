export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export interface ConnectorAccount {
  id?: string;
  name?: string;
  email?: string;
}

export interface AuthorizeUrlParams {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * A "Path B" connector adapter: RevOps owns the OAuth app and performs the
 * handshake directly with the provider, instead of delegating to an Azure
 * managed connector. Used for connectors whose Azure shared app is broken
 * (e.g. mismatched redirect registration) or when we need the tokens ourselves.
 */
export interface ConnectorAdapter {
  /** Canonical connector id (the catalog slug). */
  readonly slug: string;
  readonly displayName: string;
  /** True when the client id/secret for this provider are available. */
  isConfigured(): boolean;
  buildAuthorizeUrl(params: AuthorizeUrlParams): string;
  exchangeCode(params: ExchangeCodeParams): Promise<OAuthTokenSet>;
  refreshToken?(refreshToken: string): Promise<OAuthTokenSet>;
  getAccount(accessToken: string): Promise<ConnectorAccount>;
  /** Read-only scopes requested from the provider (informational). */
  scopes(): string[];
}
