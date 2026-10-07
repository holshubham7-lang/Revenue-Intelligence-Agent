import { scryptSync, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';

/**
 * v1.0 and passwords changed through the admin panel use bcrypt. The v1.1
 * public API creates new passwords in the form `scrypt$<salt hex>$<hash hex>`.
 * Accept both so existing accounts remain able to sign in after the upgrade.
 */
export async function verifyAdminPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (storedHash.startsWith('scrypt$')) {
    const [, saltHex, hashHex, extra] = storedHash.split('$');
    if (
      extra !== undefined ||
      !saltHex ||
      !hashHex ||
      !/^[\da-f]{32}$/i.test(saltHex) ||
      !/^[\da-f]{128}$/i.test(hashHex)
    ) {
      return false;
    }

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  }

  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}
