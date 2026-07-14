import { describe, expect, it } from "vitest";
import {
  looksLikeAcronymCompany,
  looksLikeCompany,
} from "@/lib/company-lookup";

describe("looksLikeAcronymCompany", () => {
  it("treats short ALL-CAPS names as company acronyms", () => {
    expect(looksLikeAcronymCompany("NLA")).toBe(true);
    expect(looksLikeAcronymCompany("ABC")).toBe(true);
    expect(looksLikeAcronymCompany("UK")).toBe(true);
    expect(looksLikeAcronymCompany("N.L.A")).toBe(true);
    expect(looksLikeAcronymCompany("  NLA  ")).toBe(true);
  });

  it("does not treat short person-like names as acronyms", () => {
    expect(looksLikeAcronymCompany("Ann")).toBe(false);
    expect(looksLikeAcronymCompany("Jon")).toBe(false);
    expect(looksLikeAcronymCompany("Li")).toBe(false);
  });

  it("rejects longer or non-letter strings", () => {
    expect(looksLikeAcronymCompany("NLA Properties")).toBe(false);
    expect(looksLikeAcronymCompany("A")).toBe(false);
    expect(looksLikeAcronymCompany("ABCDE")).toBe(false);
    expect(looksLikeAcronymCompany("N2A")).toBe(false);
    expect(looksLikeAcronymCompany(null)).toBe(false);
    expect(looksLikeAcronymCompany("")).toBe(false);
  });
});

describe("looksLikeCompany", () => {
  it("matches corporate suffixes", () => {
    expect(looksLikeCompany("NLA Properties Ltd")).toBe(true);
    expect(looksLikeCompany("Star Plans Limited")).toBe(true);
    expect(looksLikeCompany("Acme LLP")).toBe(true);
  });

  it("matches short ALL-CAPS acronyms", () => {
    expect(looksLikeCompany("NLA")).toBe(true);
    expect(looksLikeCompany("ABC")).toBe(true);
  });

  it("does not match ordinary person names", () => {
    expect(looksLikeCompany("John Smith")).toBe(false);
    expect(looksLikeCompany("Ann")).toBe(false);
    expect(looksLikeCompany("Robert Jones")).toBe(false);
  });
});
