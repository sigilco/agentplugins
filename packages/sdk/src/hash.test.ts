import { describe, expect, it } from "vitest";
import { sha256, sha256HexOfText, sriSha256, toBase64, toHex } from "./hash.js";

// RFC 6234 / FIPS 180-4 known answers.
const vectors: [string, string][] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
];

describe("sha256", () => {
  it("matches FIPS vectors", () => {
    for (const [input, hex] of vectors) {
      expect(toHex(sha256(new TextEncoder().encode(input)))).toBe(hex);
    }
  });

  it("handles >64-byte and >1MB inputs", () => {
    const big = new Uint8Array(1_000_000).fill(97);
    const digest = toHex(sha256(big));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256HexOfText hashes utf-8 text", () => {
    expect(sha256HexOfText("abc")).toBe(vectors[1]![1]);
  });

  it("sriSha256 emits sha256-<base64>", () => {
    const sri = sriSha256(new TextEncoder().encode(""));
    expect(sri.startsWith("sha256-")).toBe(true);
    expect(toBase64(sha256(new TextEncoder().encode("")))).toBe(sri.slice(7));
  });
});
