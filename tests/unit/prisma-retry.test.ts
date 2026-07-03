import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { isTransientPrismaError, withPrismaRetry } from "@/lib/prisma-retry";

describe("isTransientPrismaError", () => {
  it("detects Prisma initialization failures", () => {
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      "5.0.0",
    );
    expect(isTransientPrismaError(err)).toBe(true);
  });

  it("detects known transient Prisma codes", () => {
    const err = new Prisma.PrismaClientKnownRequestError("timeout", {
      code: "P1001",
      clientVersion: "5.0.0",
    });
    expect(isTransientPrismaError(err)).toBe(true);
  });

  it("ignores non-transient Prisma errors", () => {
    const err = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    expect(isTransientPrismaError(err)).toBe(false);
  });
});

describe("withPrismaRetry", () => {
  it("retries transient failures then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientInitializationError(
          "Can't reach database server",
          "5.0.0",
        ),
      )
      .mockResolvedValueOnce(["ok"]);

    const result = await withPrismaRetry(fn, {
      attempts: 3,
      baseDelayMs: 1,
      label: "test",
    });

    expect(result).toEqual(["ok"]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent errors", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withPrismaRetry(fn, { attempts: 3, baseDelayMs: 1, label: "test" }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
