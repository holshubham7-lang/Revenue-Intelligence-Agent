import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { VaultService } from './vault.service.js';

const DEK_32 = Buffer.alloc(32, 1);
const DEK_WRAPPED_BASE64 = Buffer.from(DEK_32).toString('base64');

const mocks = vi.hoisted(() => ({
  getKey: vi.fn(),
  createKey: vi.fn(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  wrapKey: vi.fn(),
  unwrapKey: vi.fn(),
}));

vi.mock('@azure/keyvault-keys', () => {
  class KeyClient {
    constructor() {}
    getKey(name: string) {
      return mocks.getKey(name);
    }
    createKey(name: string, type: string, opts: unknown) {
      return mocks.createKey(name, type, opts);
    }
  }
  class CryptographyClient {
    constructor() {}
    wrapKey(alg: string, key: Buffer) {
      return mocks.wrapKey(alg, key);
    }
    unwrapKey(alg: string, wrapped: Uint8Array) {
      return mocks.unwrapKey(alg, wrapped);
    }
  }
  return { KeyClient, CryptographyClient };
});

vi.mock('@azure/keyvault-secrets', () => {
  class SecretClient {
    constructor() {}
    getSecret(name: string) {
      return mocks.getSecret(name);
    }
    setSecret(name: string, value: string) {
      return mocks.setSecret(name, value);
    }
  }
  return { SecretClient };
});

vi.mock('@azure/identity', () => {
  class DefaultAzureCredential {}
  return { DefaultAzureCredential };
});

const TEST_VAULT_URL = 'https://test.vault.azure.net/';

function makeService(vaultUrl = TEST_VAULT_URL): VaultService {
  const config = vaultUrl
    ? new ConfigService({ KEY_VAULT_URL: vaultUrl })
    : new ConfigService({});
  return new VaultService(config);
}

describe('VaultService (DEK/KEK custody)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getKey.mockResolvedValue({ id: 'kek-id', name: 'encryption-kek' });
    mocks.createKey.mockResolvedValue({
      id: 'kek-id',
      name: 'encryption-kek',
    });
  });

  it('unwraps an existing wrapped DEK and returns a 32-byte key', async () => {
    mocks.getSecret.mockResolvedValue({ value: DEK_WRAPPED_BASE64 });
    mocks.unwrapKey.mockResolvedValue({ result: DEK_32 });

    const service = makeService();
    const key = await service.getFieldEncryptionKey();

    expect(key).toEqual(DEK_32);
    expect(key).toHaveLength(32);
    expect(mocks.getSecret).toHaveBeenCalledWith('ENCRYPTION-KEY-WRAPPED');
    expect(mocks.unwrapKey).toHaveBeenCalled();
    expect(mocks.setSecret).not.toHaveBeenCalled();
  });

  it('caches the unwrapped DEK (does not hit the vault again)', async () => {
    mocks.getSecret.mockResolvedValue({ value: DEK_WRAPPED_BASE64 });
    mocks.unwrapKey.mockResolvedValue({ result: DEK_32 });

    const service = makeService();
    await service.getFieldEncryptionKey();
    mocks.getSecret.mockClear();
    mocks.unwrapKey.mockClear();

    const again = await service.getFieldEncryptionKey();
    expect(again).toEqual(DEK_32);
    expect(mocks.getSecret).not.toHaveBeenCalled();
    expect(mocks.unwrapKey).not.toHaveBeenCalled();
  });

  it('creates and wraps a fresh DEK when none exists yet', async () => {
    mocks.getSecret.mockRejectedValue(new Error('secret not found'));
    mocks.setSecret.mockResolvedValue({});
    mocks.wrapKey.mockResolvedValue({ result: DEK_32 });

    const service = makeService();
    const key = await service.getFieldEncryptionKey();

    expect(key).toHaveLength(32);
    expect(mocks.wrapKey).toHaveBeenCalled();
    expect(mocks.setSecret).toHaveBeenCalledWith(
      'ENCRYPTION-KEY-WRAPPED',
      DEK_WRAPPED_BASE64,
    );
  });

  it('adopts the legacy ENCRYPTION-KEY secret as the DEK when present', async () => {
    mocks.getSecret
      .mockRejectedValueOnce(new Error('wrapped not found'))
      .mockResolvedValueOnce({ value: DEK_WRAPPED_BASE64 });
    mocks.setSecret.mockResolvedValue({});
    mocks.wrapKey.mockResolvedValue({ result: DEK_32 });

    const service = makeService();
    const key = await service.getFieldEncryptionKey();

    expect(key).toEqual(DEK_32);
    expect(mocks.getSecret).toHaveBeenNthCalledWith(1, 'ENCRYPTION-KEY-WRAPPED');
    expect(mocks.getSecret).toHaveBeenNthCalledWith(2, 'ENCRYPTION-KEY');
    expect(mocks.setSecret).toHaveBeenCalledWith(
      'ENCRYPTION-KEY-WRAPPED',
      DEK_WRAPPED_BASE64,
    );
  });

  it('throws when the unwrapped DEK has an invalid length', async () => {
    mocks.getSecret.mockResolvedValue({
      value: Buffer.alloc(20).toString('base64'),
    });
    mocks.unwrapKey.mockResolvedValue({ result: Buffer.alloc(20) });

    const service = makeService();
    await expect(service.getFieldEncryptionKey()).rejects.toThrow(
      /invalid length 20 \(expected 32\)/,
    );
  });

  it('throws when KEY_VAULT_URL is not configured', async () => {
    const service = new VaultService(new ConfigService({}));
    await expect(service.getFieldEncryptionKey()).rejects.toThrow(
      /KEY_VAULT_URL is required/,
    );
  });

  it('creates the KEK (RSA wrap/unwrap) when it is missing', async () => {
    mocks.getKey.mockRejectedValue(new Error('key not found'));
    mocks.getSecret.mockResolvedValue({ value: DEK_WRAPPED_BASE64 });
    mocks.unwrapKey.mockResolvedValue({ result: DEK_32 });

    const service = makeService();
    await service.getFieldEncryptionKey();

    expect(mocks.createKey).toHaveBeenCalledWith(
      'encryption-kek',
      'RSA',
      expect.objectContaining({
        keyOps: ['wrapKey', 'unwrapKey'],
        keySize: 3072,
      }),
    );
  });

  it('zeroes the in-memory DEK on shutdown', async () => {
    mocks.getSecret.mockResolvedValue({ value: DEK_WRAPPED_BASE64 });
    mocks.unwrapKey.mockResolvedValue({ result: DEK_32 });

    const service = makeService();
    const key = await service.getFieldEncryptionKey();
    expect(key.every((b) => b === 1)).toBe(true);

    await service.onApplicationShutdown();

    expect(key.every((b) => b === 0)).toBe(true);
  });
});
