export const FIELD_ENCRYPTION_PROVIDER = 'FIELD_ENCRYPTION_PROVIDER';

export interface EncryptedField {
  iv: string;
  tag: string;
  data: string;
}

/**
 * Abstraction over the field-encryption backend. The actual AES unit of work
 * is performed either locally (KEK/DEK unwrap or local dev key) or inside
 * Azure Managed HSM (all crypto in the HSM).
 */
export interface FieldEncryptionProvider {
  encrypt(plaintext: string): Promise<EncryptedField>;
  decrypt(field: EncryptedField): Promise<string>;
}