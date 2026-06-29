import { describe, it, expect } from 'vitest';
import { normalizeSource, parseSubdir, parseBranch } from '../src/store.js';

describe('normalizeSource', () => {
  it('expands shorthand user/repo', () => {
    expect(normalizeSource('sigilco/agentplugins-roster')).toBe('https://github.com/sigilco/agentplugins-roster');
  });

  it('strips /tree/branch/path', () => {
    expect(normalizeSource('https://github.com/sigilco/agentplugins-roster/tree/main/plugins/roster'))
      .toBe('https://github.com/sigilco/agentplugins-roster');
  });

  it('strips /blob/branch/path', () => {
    expect(normalizeSource('https://github.com/u/r/blob/main/some/file.ts'))
      .toBe('https://github.com/u/r');
  });

  it('converts SSH to HTTPS', () => {
    expect(normalizeSource('git@github.com:u/r.git')).toBe('https://github.com/u/r');
  });

  it('handles deep branch/subdir', () => {
    expect(normalizeSource('https://github.com/u/r/tree/feat/a/sub/dir'))
      .toBe('https://github.com/u/r');
  });

  it('strips trailing .git', () => {
    expect(normalizeSource('https://github.com/u/r.git')).toBe('https://github.com/u/r');
  });

  it('strips trailing slash', () => {
    expect(normalizeSource('https://github.com/u/r/')).toBe('https://github.com/u/r');
  });
});

describe('parseSubdir', () => {
  it('returns undefined for plain repo URL', () => {
    expect(parseSubdir('https://github.com/sigilco/agentplugins-roster')).toBeUndefined();
  });

  it('returns undefined for shorthand', () => {
    expect(parseSubdir('sigilco/agentplugins-roster')).toBeUndefined();
  });

  it('returns undefined for SSH URL', () => {
    expect(parseSubdir('git@github.com:u/r.git')).toBeUndefined();
  });

  it('extracts single-segment subdir', () => {
    expect(parseSubdir('https://github.com/sigilco/agentplugins-roster/tree/main/plugins/roster'))
      .toBe('plugins/roster');
  });

  it('extracts subdir after first-segment branch (slash-in-branch is ambiguous; first segment wins)', () => {
    expect(parseSubdir('https://github.com/u/r/tree/feat/a/sub/dir'))
      .toBe('a/sub/dir');
  });
});

describe('parseBranch', () => {
  it('returns undefined for plain repo URL', () => {
    expect(parseBranch('https://github.com/sigilco/agentplugins-roster')).toBeUndefined();
  });

  it('extracts main branch', () => {
    expect(parseBranch('https://github.com/sigilco/agentplugins-roster/tree/main/plugins/roster'))
      .toBe('main');
  });

  it('extracts simple branch (no slash in name)', () => {
    expect(parseBranch('https://github.com/u/r/tree/develop'))
      .toBe('develop');
  });
});
