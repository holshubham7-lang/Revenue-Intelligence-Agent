/**
 * Seed your Azure Key Vault with the secrets found in api/.env.
 *
 * Usage:
 *   KEY_VAULT_URL=https://your-vault.vault.azure.net node scripts/seed-vault.mjs
 *
 * Requires: an Azure CLI login (az login) or other DefaultAzureCredential
 * identity with "Key Vault Secrets Officer" permissions on the vault.
 */
import 'dotenv/config';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const vaultUrl = process.env.KEY_VAULT_URL?.trim();
if (!vaultUrl) {
  console.error('KEY_VAULT_URL is required.');
  process.exit(1);
}

// Migration helper: if GOOGLE_CLIENT_ID/SECRET are not set but the legacy
// apps.googleusercontent.com.json still exists, import its web credentials.
function googleFromLegacyJson() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return;
  }
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), '../../apps.googleusercontent.com.json'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../apps.googleusercontent.com.json'),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      const creds = parsed.web ?? parsed.installed ?? {};
      if (creds.client_id && creds.client_secret) {
        if (!process.env.GOOGLE_CLIENT_ID) process.env.GOOGLE_CLIENT_ID = creds.client_id;
        if (!process.env.GOOGLE_CLIENT_SECRET) process.env.GOOGLE_CLIENT_SECRET = creds.client_secret;
        console.log(`import Google credentials from ${file}`);
        return;
      }
    } catch {
      // continue to next candidate
    }
  }
}

googleFromLegacyJson();

const SECRET_MAP = [
  ['ENCRYPTION_KEY', 'ENCRYPTION-KEY'],
  ['JWT_SECRET', 'JWT-SECRET'],
  ['GOOGLE_CLIENT_ID', 'GOOGLE-CLIENT-ID'],
  ['GOOGLE_CLIENT_SECRET', 'GOOGLE-CLIENT-SECRET'],
  ['MICROSOFT_CLIENT_ID', 'MICROSOFT-CLIENT-ID'],
  ['MICROSOFT_CLIENT_SECRET', 'MICROSOFT-CLIENT-SECRET'],
  ['LINKEDIN_CLIENT_ID', 'LINKEDIN-CLIENT-ID'],
  ['LINKEDIN_CLIENT_SECRET', 'LINKEDIN-CLIENT-SECRET'],
];

const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
let seeded = 0;
let skipped = 0;

for (const [envKey, vaultName] of SECRET_MAP) {
  if (!process.env[envKey] || process.env[envKey].trim() === '') {
    console.log(`skip  ${vaultName} (${envKey} not set)`);
    skipped++;
    continue;
  }
  await client.setSecret(vaultName, process.env[envKey]);
  console.log(`seed  ${vaultName} <- ${envKey}`);
  seeded++;
}

console.log(`\nDone: ${seeded} secrets seeded, ${skipped} skipped (${vaultUrl})`);