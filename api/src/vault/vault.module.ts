import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  FIELD_ENCRYPTION_PROVIDER,
  FieldEncryptionProvider,
} from '../encryption/field-encryption.js';
import { LocalAesFieldEncryption } from '../encryption/local-aes-field-encryption.js';
import { ManagedHsmFieldEncryption } from './managed-hsm-field-encryption.js';
import {
  FIELD_ENCRYPTION_KEY,
  VaultService,
} from './vault.service.js';

/**
 * Global module exposing wallet-backed (Azure Key Vault / Managed HSM) secret
 * custody. Selects the field-encryption backend based on KEY_VAULT_MODE:
 *
 *  - "managed-hsm"   -> ManagedHsmFieldEncryption. AES-256-GCM is performed
 *    entirely inside Azure Managed HSM with a non-exportable oct-HSM key;
 *    key material never leaves the HSM.
 *  - "kek" (default) -> KEK/DEK unwrap from a standard Key Vault. The RSA KEK
 *    never leaves the vault; the AES-256 DEK exists only as a wrapped blob at
 *    rest and an in-memory buffer while the process runs.
 *  - No vault       -> local development uses the ENCRYPTION_KEY env value
 *    (base64, 32 bytes), fail-closed if missing.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    VaultService,
    {
      provide: FIELD_ENCRYPTION_KEY,
      inject: [VaultService, ConfigService],
      useFactory: async (vault: VaultService, config: ConfigService) => {
        if (config.get<string>('KEY_VAULT_MODE') === 'managed-hsm') {
          // The Managed HSM backend holds its own key; the DEK token is not
          // used in this mode.
          return Buffer.alloc(0);
        }
        if (config.get<string>('KEY_VAULT_URL')?.trim()) {
          return vault.getFieldEncryptionKey();
        }
        const local = Buffer.from(
          config.get<string>('ENCRYPTION_KEY') ?? '',
          'base64',
        );
        if (local.length === 32) {
          return local;
        }
        throw new Error(
          'ENCRYPTION_KEY (32-byte base64) is required when KEY_VAULT_URL is unset. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
        );
      },
    },
    {
      provide: FIELD_ENCRYPTION_PROVIDER,
      inject: [ConfigService, FIELD_ENCRYPTION_KEY],
      useFactory: (
        config: ConfigService,
        dek: Buffer,
      ): FieldEncryptionProvider => {
        if (config.get<string>('KEY_VAULT_MODE') === 'managed-hsm') {
          return new ManagedHsmFieldEncryption(config);
        }
        return new LocalAesFieldEncryption(dek);
      },
    },
  ],
  exports: [VaultService, FIELD_ENCRYPTION_KEY, FIELD_ENCRYPTION_PROVIDER],
})
export class VaultModule {}