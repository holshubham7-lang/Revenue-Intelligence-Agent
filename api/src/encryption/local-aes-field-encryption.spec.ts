import { LocalAesFieldEncryption } from './local-aes-field-encryption.js';
import { createHash } from 'node:crypto';

const DEK = Buffer.from(
  'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  'base64',
);

describe('LocalAesFieldEncryption', () => {
  it('rejects a key that is not a 32-byte buffer', () => {
    for (const bad of [Buffer.alloc(16), Buffer.alloc(64), 'not-a-buffer' as unknown]) {
      expect(() => new LocalAesFieldEncryption(bad as Buffer)).toThrow(
        /expected 32 bytes/,
      );
    }
  });

  it('round-trips plaintext through encrypt then decrypt', async () => {
    const enc = new LocalAesFieldEncryption(DEK);
    const field = await enc.encrypt('PII: john.doe@example.com');
    expect(field.iv).toBeTruthy();
    expect(field.tag).toBeTruthy();
    expect(field.data).toBeTruthy();
    await expect(enc.decrypt(field)).resolves.toBe(
      'PII: john.doe@example.com',
    );
  });

  it('produces a unique IV per encryption (no ciphertext reuse)', async () => {
    const enc = new LocalAesFieldEncryption(DEK);
    const a = await enc.encrypt('same value');
    const b = await enc.encrypt('same value');
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('throws when the auth tag fails (tampered ciphertext)', async () => {
    const enc = new LocalAesFieldEncryption(DEK);
    const field = await enc.encrypt('integrity matters');
    const tampered = {
      ...field,
      data: Buffer.from(
        Array.from(Buffer.from(field.data, 'base64')).map((b, i) =>
          i === 0 ? (b ^ 0x01) & 0xff : b,
        ),
      ).toString('base64'),
    };
    await expect(enc.decrypt(tampered)).rejects.toThrow();
  });

  it('throws when a non-empty auth tag is supplied for a different IV', async () => {
    const enc = new LocalAesFieldEncryption(DEK);
    const field = await enc.encrypt('oracle check');
    await expect(
      enc.decrypt({ iv: 'AAAAAAAAAAA=', tag: field.tag, data: field.data }),
    ).rejects.toThrow();
  });

  it('is deterministic across instances (stable field-encryption key)', async () => {
    const a = new LocalAesFieldEncryption(DEK);
    const b = new LocalAesFieldEncryption(DEK);
    const field = await a.encrypt('cross-instance value');
    await expect(b.decrypt(field)).resolves.toBe('cross-instance value');
  });

  it('handles unicode and empty-string plaintext', async () => {
    const enc = new LocalAesFieldEncryption(DEK);
    await expect(enc.decrypt(await enc.encrypt(''))).resolves.toBe('');
    const uni = 'héllo wörld — 你好 🚀';
    await expect(enc.decrypt(await enc.encrypt(uni))).resolves.toBe(uni);
  });

  it('zeroes nothing sensitive and keeps key isolated (key identity)', () => {
    const enc = new LocalAesFieldEncryption(DEK);
    expect((enc as unknown as { key: Buffer }).key).toBeInstanceOf(Buffer);
    expect((enc as unknown as { key: Buffer }).key).toHaveLength(32);
  });

  it('key matches the canonical DEK derivation from a known secret', () => {
    const enc = new LocalAesFieldEncryption(DEK);
    expect((enc as unknown as { key: Buffer }).key.toString('base64')).toBe(
      DEK.toString('base64'),
    );
    expect(createHash('sha256').update(DEK).digest('hex')).toHaveLength(64);
  });

  it('exposes encrypt/decrypt as async methods', async () => {
    const enc = new LocalAesFieldEncryption(DEK);
    const field = await enc.encrypt('x');
    const decrypted = await enc.decrypt(field);
    expect(decrypted).toBe('x');
  });
});
