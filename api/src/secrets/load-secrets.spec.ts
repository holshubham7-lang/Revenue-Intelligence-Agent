import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const mocks = vi.hoisted(() => ({
  getSecret: vi.fn(),
}));

vi.mock('@azure/keyvault-secrets', () => {
  class SecretClient {
    constructor() {}
    getSecret(name: string) {
      return mocks.getSecret(name);
    }
  }
  return { SecretClient };
});

vi.mock('@azure/identity', () => {
  class DefaultAzureCredential {}
  return { DefaultAzureCredential };
});

import { loadSecretsFromKeyVault } from './load-secrets.js';

describe('loadSecretsFromKeyVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KEY_VAULT_URL;
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_LOCAL_SECRETS;
    delete process.env.KEY_VAULT_MODE;
    process.env.JWT_SECRET = 'local-stale-value';
    process.env.ENCRYPTION_KEY = 'local-stale-value';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('aborts in production without KEY_VAULT_URL (fail-closed)', async () => {
    process.env.NODE_ENV = 'production';
    await expect(loadSecretsFromKeyVault()).rejects.toThrow(
      /KEY_VAULT_URL is required in production/,
    );
  });

  it('aborts in development without KEY_VAULT_URL and without the local escape hatch', async () => {
    await expect(loadSecretsFromKeyVault()).rejects.toThrow(
      /ALLOW_LOCAL_SECRETS is not "true"/,
    );
  });

  it('proceeds with local .env values when ALLOW_LOCAL_SECRETS=true', async () => {
    process.env.ALLOW_LOCAL_SECRETS = 'true';
    await expect(loadSecretsFromKeyVault()).resolves.toBeUndefined();
    expect(mocks.getSecret).not.toHaveBeenCalled();
    expect(process.env.JWT_SECRET).toBe('local-stale-value');
  });

  it('loads every mapped secret from Key Vault and clears stale local values', async () => {
    process.env.KEY_VAULT_URL = 'https://test.vault.azure.net/';
    process.env.NODE_ENV = 'production';
    mocks.getSecret.mockImplementation(async (name: string) => ({
      value: `vault-value-${name}`,
    }));

    await loadSecretsFromKeyVault();

    expect(process.env.JWT_SECRET).toBe('vault-value-JWT-SECRET');
    expect(process.env.ENCRYPTION_KEY).toBe('vault-value-ENCRYPTION-KEY');
    expect(process.env.GOOGLE_CLIENT_ID).toBe('vault-value-GOOGLE-CLIENT-ID');
    expect(process.env.MICROSOFT_CLIENT_SECRET).toBe(
      'vault-value-MICROSOFT-CLIENT-SECRET',
    );
    expect(process.env.LINKEDIN_CLIENT_ID).toBe(
      'vault-value-LINKEDIN-CLIENT-ID',
    );
  });

  it('fails closed in production when a required secret cannot be fetched', async () => {
    process.env.KEY_VAULT_URL = 'https://test.vault.azure.net/';
    process.env.NODE_ENV = 'production';
    mocks.getSecret.mockRejectedValue(new Error('403 permission denied'));

    await expect(loadSecretsFromKeyVault()).rejects.toThrow(
      /Failed to load secret/,
    );
  });

  it('fails closed in production when a secret has an empty value', async () => {
    process.env.KEY_VAULT_URL = 'https://test.vault.azure.net/';
    process.env.NODE_ENV = 'production';
    mocks.getSecret.mockResolvedValue({ value: '' });

    await expect(loadSecretsFromKeyVault()).rejects.toThrow(
      /empty secret value/,
    );
  });

  it('warns (without aborting) in development when secrets are missing', async () => {
    process.env.KEY_VAULT_URL = 'https://test.vault.azure.net/';
    delete process.env.NODE_ENV;
    mocks.getSecret.mockResolvedValue({ value: 'whatever' });

    await expect(loadSecretsFromKeyVault()).resolves.toBeUndefined();
    expect(process.env.JWT_SECRET).toBe('whatever');
  });

  it('skips the ENCRYPTION-KEY secret in managed-hsm mode', async () => {
    process.env.KEY_VAULT_URL = 'https://test.managedhsm.azure.net/';
    process.env.NODE_ENV = 'production';
    process.env.KEY_VAULT_MODE = 'managed-hsm';
    mocks.getSecret.mockImplementation(async (name: string) => ({
      value: `vault-value-${name}`,
    }));

    await loadSecretsFromKeyVault();

    expect(process.env.ENCRYPTION_KEY).toBeUndefined();
    expect(process.env.JWT_SECRET).toBe('vault-value-JWT-SECRET');
  });
});
