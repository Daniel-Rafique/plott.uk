import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readEnrichmentCacheTool,
  writeEnrichmentCacheTool,
} from "@/lib/ai/tools/enrichment";
import { writeResolvedApplicationToCache } from "@/lib/enrichment";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationEnrichment: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const applicationEnrichment = prisma.applicationEnrichment as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

describe("enrichment cache tools", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads applicant email metadata from the cache", async () => {
    applicationEnrichment.findUnique.mockResolvedValue({
      planningEntity: BigInt(123),
      applicationRef: "24/00123/FUL",
      applicantName: "Jane Smith, Director",
      applicantAddress: "Example Ltd, 1 High Street",
      applicantEmail: "jane@example.com",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 91,
      applicantEmailStatus: "valid",
      agentName: null,
      agentAddress: null,
      agentPhone: null,
      agentEmail: null,
      caseOfficer: null,
      ward: null,
      source: "hunter",
      confidence: "high",
      fetchedAt: new Date("2026-06-16T12:00:00.000Z"),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await (
      readEnrichmentCacheTool as unknown as {
        execute: (input: { planningEntity: number }) => Promise<unknown>;
      }
    ).execute({ planningEntity: 123 });

    expect(result).toMatchObject({
      found: true,
      applicantEmail: "jane@example.com",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 91,
      applicantEmailStatus: "valid",
    });
  });

  it("writes applicant email metadata to the cache", async () => {
    applicationEnrichment.upsert.mockResolvedValue({});

    await (
      writeEnrichmentCacheTool as unknown as {
        execute: (input: {
          planningEntity: number;
          applicationRef: string;
          applicantEmail: string;
          applicantEmailSource: string;
          applicantEmailConfidence: number;
          applicantEmailStatus: string;
          source: "hunter";
          confidence: "high";
        }) => Promise<unknown>;
      }
    ).execute({
      planningEntity: 123,
      applicationRef: "24/00123/FUL",
      applicantEmail: "jane@example.com",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 91,
      applicantEmailStatus: "valid",
      source: "hunter",
      confidence: "high",
    });

    expect(applicationEnrichment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          applicantEmail: "jane@example.com",
          applicantEmailSource: "hunter",
          applicantEmailConfidence: 91,
          applicantEmailStatus: "valid",
        }),
        update: expect.objectContaining({
          applicantEmail: "jane@example.com",
          applicantEmailSource: "hunter",
          applicantEmailConfidence: 91,
          applicantEmailStatus: "valid",
        }),
      }),
    );
  });

  it("persists resolved application email metadata outside the agent cache tool", async () => {
    applicationEnrichment.upsert.mockResolvedValue({});

    await writeResolvedApplicationToCache({
      applicationRef: "24/00123/FUL",
      planningEntity: 123,
      applicantName: "Jane Smith, Director",
      applicantAddress: "Example Ltd, 1 High Street",
      applicantEmail: "jane@example.com",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 91,
      applicantEmailStatus: "valid",
      agentName: null,
      agentEmail: null,
      source: "composite",
      confidence: "high",
      sources: ["companies_house", "hunter"],
    });

    expect(applicationEnrichment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          applicationRef: "24/00123/FUL",
          applicantEmail: "jane@example.com",
          applicantEmailSource: "hunter",
          applicantEmailConfidence: 91,
          applicantEmailStatus: "valid",
        }),
        update: expect.objectContaining({
          applicantEmail: "jane@example.com",
          applicantEmailSource: "hunter",
          applicantEmailConfidence: 91,
          applicantEmailStatus: "valid",
        }),
      }),
    );
  });
});
