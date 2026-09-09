import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultAzureCredential } from '@azure/identity';
import {
  CryptographyClient,
  KeyClient,
  KeyVaultKey,
} from '@azure/keyvault-keys';
import {
  EncryptedField,
  FieldEncryptionProvider,
} from '../encryption/field-encryption.js';

const DEK_KEY_NAME = 'encryption-dek-oct';
const GCM_ALGORITHM = 'A256GCM';

/**
 * Managed HSM field-encryption backend.
 *
 * The data-encryption key is a NON-EXPORTABLE `oct-HSM` symmetric AES-256 key
 * provisioned inside Azure Managed HSM. Every AES-GCM encrypt/decrypt runs
 * inside the HSM via CryptographyClient; the plaintext key material never
 * leaves the HSM and never enters process memory. This is the strongest
 * custody option ("key held in the wallet").
 *
 * Access is enforced by Managed HSM RBAC: the app identity needs only
 * "Cryptography Operator" on this key. The key cannot be exported.
 */
@Injectable()
export class ManagedHsmFieldEncryption implements FieldEncryptionProvider {
  private readonly logger = new Logger(ManagedHsmFieldEncryption.name);
  private crypto?: CryptographyClient;

  constructor(private readonly config: ConfigService) {}

  async encrypt(plaintext: string): Promise<EncryptedField> {
    const client = await this.client();
    const result = await client.encrypt({
      algorithm: GCM_ALGORITHM,
      plaintext: Buffer.from(plaintext, 'utf8'),
    });
    if (!result.iv || !result.authenticationTag) {
      throw new Error(
        `Managed HSM encrypt for ${DEK_KEY_NAME} did not return IV/auth tag.`,
      );
    }
    return {
      iv: Buffer.from(result.iv).toString('base64'),
      tag: Buffer.from(result.authenticationTag).toString('base64'),
      data: Buffer.from(result.result).toString('base64'),
    };
  }

  async decrypt(field: EncryptedField): Promise<string> {
    const client = await this.client();
    const result = await client.decrypt({
      algorithm: GCM_ALGORITHM,
      ciphertext: Buffer.from(field.data, 'base64'),
      iv: Buffer.from(field.iv, 'base64'),
      authenticationTag: Buffer.from(field.tag, 'base64'),
    });
    return Buffer.from(result.result).toString('utf8');
  }

  private async client(): Promise<CryptographyClient> {
    if (this.crypto) {
      return this.crypto;
    }

    const vaultUrl = this.config.get<string>('KEY_VAULT_URL')?.trim();
    if (!vaultUrl) {
      throw new Error(
        'KEY_VAULT_URL is required for the Managed HSM field-encryption backend.',
      );
    }

    if (!/managedhsm\.azure\.net/.test(new URL(vaultUrl).hostname)) {
      throw new Error(
        'Managed HSM backend requires a Managed HSM endpoint (https://<hsm>.managedhsm.azure.net/).',
      );
    }

    const credential = new DefaultAzureCredential();
    const keyClient = new KeyClient(vaultUrl, credential);
    const key = await this.getOrCreateKey(keyClient);
    this.crypto = new CryptographyClient(key, credential);
    this.logger.log(
      `Managed HSM backend ready (key "${DEK_KEY_NAME}", A256GCM in-HSM).`,
    );
    return this.crypto;
  }

  private async getOrCreateKey(keyClient: KeyClient): Promise<KeyVaultKey> {
    try {
      const existing = await keyClient.getKey(DEK_KEY_NAME);
      this.logger.log(`Managed HSM key "${DEK_KEY_NAME}" found.`);
      return existing;
    } catch {
      const created = await keyClient.createKey(DEK_KEY_NAME, 'oct-HSM', {
        keySize: 256,
        keyOps: ['encrypt', 'decrypt'],
        enabled: true,
      });
      this.logger.warn(
        `Managed HSM key "${DEK_KEY_NAME}" did not exist — created (non-exportable).`,
      );
      return created;
    }
  }
}