import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultAzureCredential } from '@azure/identity';
import {
  CryptographyClient,
  KeyClient,
  KeyVaultKey,
} from '@azure/keyvault-keys';
import { SecretClient } from '@azure/keyvault-secrets';
import { randomBytes } from 'node:crypto';

export const FIELD_ENCRYPTION_KEY = 'FIELD_ENCRYPTION_KEY';

const KEK_NAME = 'encryption-kek';
const DEK_WRAPPED_SECRET = 'ENCRYPTION-KEY-WRAPPED';
const LEGACY_DEK_SECRET = 'ENCRYPTION-KEY';
const WRAP_ALGORITHM = 'RSA-OAEP-256';
const REQUIRED_DEK_BYTES = 32;

/**
 * VaultService owns the app's field-encryption key material using the
 * industry-standard DEK/KEK pattern:
 *
 *   - The KEK (`encryption-kek`, an RSA key) is created in Azure Key Vault
 *     and NEVER leaves the vault. All wrap/unwrap operations run inside it.
 *   - The DEK (AES-256, 32 bytes) encrypts user PII fields with AES-256-GCM.
 *     It is stored ONLY wrapped by the KEK as the Key Vault secret
 *     `ENCRYPTION-KEY-WRAPPED`. It is unwrapped into process memory at
 *     startup, used for encrypt/decrypt, and never persisted elsewhere.
 *
 * Migration: on first use, if the legacy `ENCRYPTION-KEY` secret exists
 * (previously stored as a plain secret), it is adopted as the DEK so existing
 * ciphertext remains decryptable. Otherwise a fresh random DEK is created.
 */
@Injectable()
export class VaultService implements OnApplicationShutdown {
  private readonly logger = new Logger(VaultService.name);
  private dek?: Buffer;
  private readonly credential = new DefaultAzureCredential();

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns the in-memory AES-256 data-encryption key.
   */
  async getFieldEncryptionKey(): Promise<Buffer> {
    if (this.dek) {
      return this.dek;
    }

    const vaultUrl = this.config.get<string>('KEY_VAULT_URL')?.trim();
    if (!vaultUrl) {
      throw new Error(
        'KEY_VAULT_URL is required to provision the field-encryption key.',
      );
    }

    const keyClient = new KeyClient(vaultUrl, this.credential);
    const secretClient = new SecretClient(vaultUrl, this.credential);

    const kek = await this.ensureKek(keyClient);
    const crypto = new CryptographyClient(kek, this.credential);

    let wrapped = await this.readWrappedDek(secretClient);
    if (!wrapped) {
      const dek = await this.adoptOrGenerateDek(secretClient);
      const result = await crypto.wrapKey(WRAP_ALGORITHM, dek);
      await secretClient.setSecret(
        DEK_WRAPPED_SECRET,
        Buffer.from(result.result).toString('base64'),
      );
      this.dek = dek;
      this.logger.log('Created and wrapped a new field-encryption data key.');
      return this.dek;
    }

    const unwrapped = await crypto.unwrapKey(WRAP_ALGORITHM, wrapped);
    const dek = Buffer.from(unwrapped.result);
    if (dek.length !== REQUIRED_DEK_BYTES) {
      throw new Error(
        `Unwrapped DEK has invalid length ${dek.length} (expected ${REQUIRED_DEK_BYTES}).`,
      );
    }
    this.dek = dek;
    this.logger.log(
      'Field-encryption data key unwrapped from Key Vault (key custodied by vault).',
    );
    return this.dek;
  }

  private async ensureKek(keyClient: KeyClient): Promise<KeyVaultKey> {
    try {
      const existing = await keyClient.getKey(KEK_NAME);
      this.logger.log(`KEK "${KEK_NAME}" found in vault.`);
      return existing;
    } catch {
      const created = await keyClient.createKey(KEK_NAME, 'RSA', {
        keyOps: ['wrapKey', 'unwrapKey'],
        keySize: 3072,
      });
      this.logger.warn(
        `KEK "${KEK_NAME}" did not exist — created. Rotate/verify permissions as needed.`,
      );
      return created;
    }
  }

  private async readWrappedDek(
    secretClient: SecretClient,
  ): Promise<Uint8Array | undefined> {
    try {
      const { value } = await secretClient.getSecret(DEK_WRAPPED_SECRET);
      if (value) {
        return Buffer.from(value, 'base64');
      }
    } catch {
      // not yet provisioned
    }
    return undefined;
  }

  private async adoptOrGenerateDek(
    secretClient: SecretClient,
  ): Promise<Buffer> {
    try {
      const { value } = await secretClient.getSecret(LEGACY_DEK_SECRET);
      const legacy = Buffer.from(value ?? '', 'base64');
      if (legacy.length === REQUIRED_DEK_BYTES) {
        this.logger.log(
          'Adopting legacy ENCRYPTION-KEY secret as the data key (existing ciphertext stays decryptable).',
        );
        return legacy;
      }
    } catch {
      // no legacy secret
    }
    return randomBytes(REQUIRED_DEK_BYTES);
  }

  /**
   * Best-effort scrub of the in-memory DEK on shutdown.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.dek) {
      this.dek.fill(0);
      this.dek = undefined;
    }
  }
}