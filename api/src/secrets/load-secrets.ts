import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const logger = new Logger('SecretsLoader');

/**
 * Sensitive env keys sourced from Azure Key Vault.
 * Key Vault secret names are case-insensitive and dash-friendly.
 */
const SECRET_MAP: Record<string, string> = {
  ENCRYPTION_KEY: 'ENCRYPTION-KEY',
  JWT_SECRET: 'JWT-SECRET',
  GOOGLE_CLIENT_ID: 'GOOGLE-CLIENT-ID',
  GOOGLE_CLIENT_SECRET: 'GOOGLE-CLIENT-SECRET',
  MICROSOFT_CLIENT_ID: 'MICROSOFT-CLIENT-ID',
  MICROSOFT_CLIENT_SECRET: 'MICROSOFT-CLIENT-SECRET',
  LINKEDIN_CLIENT_ID: 'LINKEDIN-CLIENT-ID',
  LINKEDIN_CLIENT_SECRET: 'LINKEDIN-CLIENT-SECRET',
  HUBSPOT_CLIENT_ID: 'HUBSPOT-CLIENT-ID',
  HUBSPOT_CLIENT_SECRET: 'HUBSPOT-CLIENT-SECRET',
};

/**
 * Secrets that may legitimately be absent (feature not yet enabled). A missing
 * value only warns; it never aborts startup, even in production.
 */
const OPTIONAL_SECRETS = new Set<string>([
  'HUBSPOT_CLIENT_ID',
  'HUBSPOT_CLIENT_SECRET',
]);

/**
 * Loads sensitive configuration from Azure Key Vault into process.env BEFORE
 * the Nest application (and ConfigModule) initialises.
 *
 * Fail-closed (all secrets must come from the wallet):
 *  - Production: KEY_VAULT_URL is REQUIRED. Startup aborts if it is unset or
 *    any required secret cannot be fetched. ALLOW_LOCAL_SECRETS is ignored.
 *  - Development: KEY_VAULT_URL is also required unless ALLOW_LOCAL_SECRETS
 *    is explicitly set to 'true', in which case the .env file values are used
 *    (loud warning). This keeps local hacking possible without Azure while
 *    the default posture is wallet-only.
 */
export async function loadSecretsFromKeyVault(): Promise<void> {
  const vaultUrl = process.env.KEY_VAULT_URL?.trim();
  const isProd = process.env.NODE_ENV === 'production';
  const allowLocal = process.env.ALLOW_LOCAL_SECRETS === 'true';
  const managedHsm = process.env.KEY_VAULT_MODE === 'managed-hsm';

  if (!vaultUrl) {
    if (isProd) {
      throw new Error(
        'KEY_VAULT_URL is required in production. Refusing to start without a secret store.',
      );
    }
    if (!allowLocal) {
      throw new Error(
        'KEY_VAULT_URL is unset and ALLOW_LOCAL_SECRETS is not "true". Secrets must live in the wallet (Key Vault). Refusing to start.',
      );
    }
    warnLocalSecrets();
    return;
  }

  // Vault is authoritative — clear any local secret values first so a stale
  // .env never leaks into the signed/served secrets.
  clearLocalSecrets();

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUrl, credential);

  const missing: string[] = [];
  for (const [envKey, vaultName] of Object.entries(SECRET_MAP)) {
    // In managed-hsm mode the encryption key is a non-exportable oct-HSM key
    // inside the HSM; there is no ENCRYPTION-KEY secret to load.
    if (managedHsm && vaultName === 'ENCRYPTION-KEY') {
      continue;
    }
    try {
      const { value } = await client.getSecret(vaultName);
      if (!value) {
        throw new Error(`empty secret value for ${vaultName}`);
      }
      process.env[envKey] = value;
    } catch (error) {
      if (isProd && !OPTIONAL_SECRETS.has(envKey)) {
        throw new Error(
          `Failed to load secret ${vaultName} from Key Vault: ${
            (error as Error).message
          }`,
        );
      }
      missing.push(`${envKey} <- ${vaultName}`);
    }
  }

  if (missing.length) {
    logger.warn(
      `The following secrets could not be loaded from Key Vault (${vaultUrl}): ${missing.join(
        ', ',
      )}. Dependent features will be unavailable.`,
    );
  }
  logger.log(`Secrets loaded from Azure Key Vault: ${vaultUrl}`);
}

function clearLocalSecrets(): void {
  for (const envKey of Object.keys(SECRET_MAP)) {
    delete process.env[envKey];
  }
}

function warnLocalSecrets(): void {
  const missing = Object.keys(SECRET_MAP).filter((k) => !process.env[k]);
  logger.warn(
    `ALLOW_LOCAL_SECRETS=true — reading sensitive values from .env (NOT the wallet). Remove this flag and set KEY_VAULT_URL for real protection.` +
      (missing.length ? ` Missing values: ${missing.join(', ')}` : ''),
  );
}