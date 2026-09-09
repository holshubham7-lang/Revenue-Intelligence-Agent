import { Injectable, Logger } from '@nestjs/common';
import { createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const REQUIRED_KEY_BYTES = 32;

/**
 * Decrypts encrypted PII (names) stored by the main app using the shared
 * ENCRYPTION_KEY (base64, 32 bytes) — matching the app's local AES-256-GCM
 * layout ({ iv, tag, data }, 12-byte IV). Degrades gracefully when the key is
 * unavailable so the panel keeps working in read/status mode.
 */
@Injectable()
export class FieldDecryptService {
  private readonly logger = new Logger(FieldDecryptService.name);
  private readonly key: Buffer | null;

  constructor(encryptionKey: string | undefined) {
    const decoded = Buffer.from(encryptionKey ?? '', 'base64');
    if (decoded.length === REQUIRED_KEY_BYTES) {
      this.key = decoded;
    } else {
      this.key = null;
      this.logger.warn(
        'ENCRYPTION_KEY missing/invalid: encrypted names will show as "(encrypted)".',
      );
    }
  }

  decrypt(field: { iv: string; tag: string; data: string }): string | null {
    if (!this.key) return null;
    try {
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
    } catch {
      return null;
    }
  }
}