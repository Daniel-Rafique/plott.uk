import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("elementFromHash", () => {
  const elements = new Map<string, { id: string }>();

  beforeEach(() => {
    elements.clear();
    vi.stubGlobal("CSS", {
      escape: (value: string) =>
        value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1"),
    });
    vi.stubGlobal("document", {
      getElementById: (id: string) => elements.get(id) ?? null,
      querySelector: (selector: string) => {
        // Mirror browser: unescaped `=` in an ID selector is a SyntaxError
        if (/^#[^=]*[=]/.test(selector) && !selector.includes("\\=")) {
          throw new SyntaxError(
            `Failed to execute 'querySelector' on 'Document': '${selector}' is not a valid selector.`,
          );
        }
        const match = /^#(.+)$/.exec(selector);
        if (!match) return null;
        const id = match[1]!.replace(/\\(.)/g, "$1");
        return elements.get(id) ?? null;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns the element for a valid hash id", async () => {
    const el = { id: "pricing" };
    elements.set("pricing", el);
    const { elementFromHash } = await import("@/lib/animation/lenis-provider");
    expect(elementFromHash("#pricing")).toBe(el);
  });

  it("does not throw on malformed hashes like #free-r=", async () => {
    const { elementFromHash } = await import("@/lib/animation/lenis-provider");
    expect(() => elementFromHash("#free-r=")).not.toThrow();
    expect(elementFromHash("#free-r=")).toBeNull();
  });

  it("returns null for empty hashes", async () => {
    const { elementFromHash } = await import("@/lib/animation/lenis-provider");
    expect(elementFromHash("")).toBeNull();
    expect(elementFromHash("#")).toBeNull();
  });
});
