import { describe, expect, it } from "vitest";
import { basename, compareUtf8, dirname, isInside, join, normalize, resolveInside } from "./path.js";

describe("path utils", () => {
  it("normalizes separators, dots, trailing slash", () => {
    expect(normalize("/a//b/./c/")).toBe("/a/b/c");
    expect(normalize("a/b/../c")).toBe("a/c");
    expect(normalize("/")).toBe("/");
  });

  it("join concatenates + normalizes", () => {
    expect(join("/root", "a", "b")).toBe("/root/a/b");
    expect(join("/root/", "/a")).toBe("/root/a");
  });

  it("isInside(root, path) boundaries", () => {
    expect(isInside("/a", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a", "/ab")).toBe(false);
    expect(isInside("/a", "/a/../b")).toBe(false);
  });

  it("resolveInside rejects escapes", () => {
    expect(resolveInside("/store", "pkg/a")).toBe("/store/pkg/a");
    expect(resolveInside("/store", "../evil")).toBeNull();
    expect(resolveInside("/store", "/abs")).toBeNull();
  });

  it("basename/dirname", () => {
    expect(basename("/a/b/c.txt")).toBe("c.txt");
    expect(dirname("/a/b/c.txt")).toBe("/a/b");
  });

  it("compareUtf8 orders by byte value", () => {
    expect(compareUtf8("a", "b") < 0).toBe(true);
    expect(compareUtf8("Z", "a") < 0).toBe(true); // byte order: Z(90) < a(97)
    expect(compareUtf8("a/b", "ab")).not.toBe(0);
    const sorted = ["zeta", "Alpha", "a/b"].sort(compareUtf8);
    expect(sorted[0]).toBe("Alpha");
  });
});
