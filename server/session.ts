// The login lives in an encrypted, httpOnly cookie on the user's device.
// The server keeps no database of passwords: each request decrypts the cookie
// with SESSION_SECRET and logs in to WebUntis if it has no live session yet.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface SessionData {
  v: 1;
  demo?: boolean;
  server: string;
  school: string;
  schoolDisplayName: string;
  username: string;
  password: string;
}

export interface Sealer {
  seal(data: SessionData): string;
  unseal(token: string | undefined): SessionData | null;
}

export function createSealer(secret: string): Sealer {
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET must be at least 16 characters');
  const key = createHash('sha256').update(secret).digest();

  return {
    seal(data) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
    },
    unseal(token) {
      if (!token) return null;
      try {
        const buf = Buffer.from(token, 'base64url');
        if (buf.length < 29) return null;
        const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
        decipher.setAuthTag(buf.subarray(12, 28));
        const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
        const data = JSON.parse(json) as SessionData;
        return data?.v === 1 ? data : null;
      } catch {
        return null;
      }
    },
  };
}

/** Stable, non-reversible id for a login, used as a cache key. */
export function sessionKey(s: SessionData): string {
  return createHash('sha256')
    .update([s.demo ? 'demo' : '', s.server, s.school, s.username, s.password].join('\0'))
    .digest('hex');
}
