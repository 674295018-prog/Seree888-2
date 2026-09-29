// tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, constantTimeCompare } from '../src/auth';

describe('Authentication Security Helpers', () => {
  it('should hash a password and generate salt', async () => {
    const res = await hashPassword('SecretPassword123');
    expect(res.hash).toBeDefined();
    expect(res.salt).toBeDefined();
    expect(res.hash.length).toBe(64); // 256 bits = 32 bytes = 64 hex chars
    expect(res.salt.length).toBe(32); // 16 bytes = 32 hex chars
  });

  it('should verify correct password with matching salt', async () => {
    const original = await hashPassword('MyAdminPass!999');
    const verification = await hashPassword('MyAdminPass!999', original.salt);

    expect(verification.hash).toBe(original.hash);
    expect(constantTimeCompare(original.hash, verification.hash)).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const original = await hashPassword('CorrectPassword123');
    const wrong = await hashPassword('WrongPassword123', original.salt);

    expect(wrong.hash).not.toBe(original.hash);
    expect(constantTimeCompare(original.hash, wrong.hash)).toBe(false);
  });

  it('should prevent timing comparison length mismatches safely', () => {
    expect(constantTimeCompare('abcd', 'abcde')).toBe(false);
    expect(constantTimeCompare('', 'a')).toBe(false);
    expect(constantTimeCompare('identical_string_123', 'identical_string_123')).toBe(true);
  });
});
