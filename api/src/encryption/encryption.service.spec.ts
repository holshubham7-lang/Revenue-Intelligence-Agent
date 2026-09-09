import { Test } from '@nestjs/testing';
import { EncryptionService } from './encryption.service.js';
import { FIELD_ENCRYPTION_PROVIDER } from './field-encryption.js';
import type {
  EncryptedField,
  FieldEncryptionProvider,
} from './field-encryption.js';

const sampleField: EncryptedField = {
  iv: 'aXZ2YWx1ZQ==',
  tag: 'dGFndmFsdWU=',
  data: 'ZGF0YXZhbHVl',
};

describe('EncryptionService', () => {
  let service: EncryptionService;
  const provider: FieldEncryptionProvider = {
    encrypt: vi.fn(async (plaintext: string) => ({
      ...sampleField,
      data: Buffer.from(plaintext, 'utf8').toString('base64'),
    })),
    decrypt: vi.fn(async (field: EncryptedField) =>
      Buffer.from(field.data, 'base64').toString('utf8'),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: FIELD_ENCRYPTION_PROVIDER, useValue: provider },
      ],
    }).compile();
    service = module.get(EncryptionService);
  });

  it('delegates encrypt to the injected field-encryption provider', async () => {
    const field = await service.encrypt('name-to-protect');
    expect(provider.encrypt).toHaveBeenCalledTimes(1);
    expect(provider.encrypt).toHaveBeenCalledWith('name-to-protect');
    expect(field.data).toBe(
      Buffer.from('name-to-protect', 'utf8').toString('base64'),
    );
  });

  it('delegates decrypt to the injected field-encryption provider', async () => {
    await expect(service.decrypt(sampleField)).resolves.toBe('datavalue');
    expect(provider.decrypt).toHaveBeenCalledTimes(1);
    expect(provider.decrypt).toHaveBeenCalledWith(sampleField);
  });

  it('propagates provider errors to callers', async () => {
    (provider.decrypt as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('auth tag check failed'),
    );
    await expect(service.decrypt(sampleField)).rejects.toThrow(
      'auth tag check failed',
    );
  });

  it('returns the exact encrypted shape expected by persistence layers', async () => {
    const field = await service.encrypt('payload');
    expect(Object.keys(field).sort()).toEqual([
      'data',
      'iv',
      'tag',
    ].sort());
  });
});
