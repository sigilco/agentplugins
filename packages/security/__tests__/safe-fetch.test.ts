import { describe, it, expect, vi } from "vitest";
import { isPrivateAddress, isBlockedHost, getDefaultAllowList, safeFetch, validateUrl, SafeFetchError } from "../src/safe-fetch";

describe("safe-fetch SSRF guards", () => {
  it("flags private IPv4 ranges", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("flags private IPv6 ranges", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
  });

  it("returns the default allow-list", () => {
    expect(getDefaultAllowList()).toContain("localhost");
  });

  it("isBlockedHost allows explicitly allow-listed hosts", () => {
    expect(isBlockedHost("10.0.0.1", ["10.0.0.1"])).toBe(false);
  });

  it("safeFetch refuses http://169.254.169.254/ (AWS metadata)", async () => {
    await expect(safeFetch({ url: "http://169.254.169.254/latest/meta-data/" })).rejects.toThrow(/allow-list|private/);
  });

  it("safeFetch refuses non-http protocols", async () => {
    await expect(safeFetch({ url: "file:///etc/passwd" })).rejects.toThrow(/non-http/);
  });

  // B16: redirect re-validation
  it("validateUrl rejects cloud metadata IP even without allow-list", async () => {
    await expect(validateUrl("http://169.254.169.254/", [])).rejects.toThrow(SafeFetchError);
  });

  it("safeFetch rejects redirect to private IP (maxRedirects loop)", async () => {
    // Mock fetch to return a 302 pointing at cloud metadata, then another 302.
    const mockFetch = vi.fn();
    // Hop 1: public URL → 302 to metadata
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/" } })
    );
    vi.stubGlobal("fetch", mockFetch);
    try {
      await expect(
        safeFetch({ url: "http://example.com/legit", allowHosts: ["example.com"] })
      ).rejects.toThrow(SafeFetchError);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("safeFetch enforces maxRedirects cap", async () => {
    const mockFetch = vi.fn();
    for (let i = 0; i < 6; i++) {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://example.com/loop" } })
      );
    }
    vi.stubGlobal("fetch", mockFetch);
    try {
      await expect(
        safeFetch({ url: "http://example.com/start", allowHosts: ["example.com"], maxRedirects: 3 })
      ).rejects.toThrow(/Exceeded max redirects/);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
