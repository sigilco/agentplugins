import { describe, it, expect } from "vitest";
import { isPrivateAddress, isBlockedHost, getDefaultAllowList, safeFetch } from "../src/safe-fetch";

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
});
