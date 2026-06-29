import { describe, expect, it } from 'vitest';
import { sanitizeName, sanitizeJoin } from '../src/sanitize.js';

describe('sanitizeName', () => {
  it('accepts kebab-case names', () => {
    expect(sanitizeName('my-plugin')).toBe('my-plugin');
    expect(sanitizeName('a')).toBe('a');
    expect(sanitizeName('plugin-42')).toBe('plugin-42');
  });

  it.each([
    ['../escape'],           // traversal
    ['..'],                  // bare traversal
    ['with/slash'],
    ['Absolute'],            // uppercase
    ['1-starts-with-digit'], // starts with digit
    ['has_underscore'],
    ['has space'],
    [''],                    // empty
    [123 as unknown as string], // wrong type
    ['a'.repeat(65)],        // too long
  ])('rejects malicious or invalid name %j', (bad) => {
    expect(() => sanitizeName(bad)).toThrow();
  });
});

describe('sanitizeJoin', () => {
  const base = '/store/plugin';

  it('accepts a relative sub-path', () => {
    expect(sanitizeJoin(base, 'child.txt')).toBe('/store/plugin/child.txt');
    expect(sanitizeJoin(base, 'sub/dir/file.ts')).toBe('/store/plugin/sub/dir/file.ts');
  });

  it.each([
    ['../sibling'],              // traversal up
    ['/etc/passwd'],             // absolute posix
    ['C:\\Windows\\sys'],        // absolute windows
    [''],                        // empty
  ])('rejects malicious or invalid path %j', (bad) => {
    expect(() => sanitizeJoin(base, bad)).toThrow();
  });

  it('rejects traversal that resolves outside base even with legit prefix', () => {
    // 'foo/../../../etc' looks like a sub-path but escapes
    expect(() => sanitizeJoin(base, 'foo/../../../etc/passwd')).toThrow();
  });
});
