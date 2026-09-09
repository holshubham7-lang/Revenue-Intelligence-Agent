import { Inject, Injectable } from '@nestjs/common';
import {
  EncryptedField,
  FIELD_ENCRYPTION_PROVIDER,
} from './field-encryption.js';
import type { FieldEncryptionProvider } from './field-encryption.js';

/**
 * Service facade over the active field-encryption backend. The backend is
 * selected by the Vault module:
 *  - Managed HSM: AES-256-GCM executed inside the HSM (oct-HSM key).
 *  - Key Vault KEK/DEK (or local dev ENCRYPTION_KEY): in-memory AES-256-GCM.
 */
@Injectable()
export class EncryptionService {
  constructor(
    @Inject(FIELD_ENCRYPTION_PROVIDER)
    private readonly provider: FieldEncryptionProvider,
  ) {}

  async encrypt(plaintext: string): Promise<EncryptedField> {
    return this.provider.encrypt(plaintext);
  }

  async decrypt(field: EncryptedField): Promise<string> {
    return this.provider.decrypt(field);
  }
}