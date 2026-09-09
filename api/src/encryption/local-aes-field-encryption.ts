import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { EncryptedField } from './field-encryption.js';
import type { FieldEncryptionProvider } from './field-encryption.js';
import { FIELD_ENCRYPTION_KEY } from '../vault/vault.service.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const REQUIRED_KEY_BYTES = 32;

/**
 * In-memory AES-256-GCM backend. The key comes from a Key Vault KEK/DEK
 * unwrap (key material only in process memory while running) or from the
 * ENCRYPTION_KEY env value in local development.
 */
@Injectable()
export class LocalAesFieldEncryption implements FieldEncryptionProvider {
  private readonly key: Buffer;

  constructor(@Inject(FIELD_ENCRYPTION_KEY) key: Buffer) {
    if (!Buffer.isBuffer(key) || key.length !== REQUIRED_KEY_BYTES) {
      throw new Error(
        `Invalid field-encryption key: expected ${REQUIRED_KEY_BYTES} bytes.`,
      );
    }
    this.key = key;
  }

  async encrypt(plaintext: string): Promise<EncryptedField> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
  }

  async decrypt(field: EncryptedField): Promise<string> {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(field.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(field.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(field.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}