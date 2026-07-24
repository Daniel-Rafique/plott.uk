import { Prisma } from "@prisma/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "@/lib/prisma";
import type { McpAuthContext } from "@/lib/mcp/auth-context";

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return Number(item);
      if (item instanceof Date) return item.toISOString();
      if (
        item &&
        typeof item === "object" &&
        typeof item.toJSON === "function"
      ) {
        return item.toJSON();
      }
      return item;
    }),
  ) as T;
}

export function toolResult(value: unknown): CallToolResult {
  const safe = jsonSafe(value);
  return {
    content: [{ type: "text", text: JSON.stringify(safe, null, 2) }],
    structuredContent:
      safe && typeof safe === "object"
        ? (safe as Record<string, unknown>)
        : { result: safe },
  };
}

export function toolError(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : "Tool execution failed",
      },
    ],
  };
}

export async function idempotentTool<T>(
  context: McpAuthContext,
  toolName: string,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const uniqueKey = {
    companyId_userId_toolName_key: {
      companyId: context.company.id,
      userId: context.user.id,
      toolName,
      key,
    },
  };
  let claim;
  try {
    claim = await prisma.mcpIdempotencyKey.create({
      data: {
        companyId: context.company.id,
        userId: context.user.id,
        toolName,
        key,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const existing = await prisma.mcpIdempotencyKey.findUnique({
      where: uniqueKey,
    });
    if (existing?.status === "completed") {
      return existing.result as T;
    }
    if (existing?.status === "failed") {
      throw new Error(
        "This idempotency key previously failed; inspect the operation before using a new key",
      );
    }
    throw new Error(
      "An operation with this idempotency key is already in progress",
    );
  }

  try {
    const result = jsonSafe(await operation());
    await prisma.mcpIdempotencyKey.update({
      where: { id: claim.id },
      data: {
        status: "completed",
        result: result as Prisma.InputJsonValue,
      },
    });
    return result;
  } catch (error) {
    await prisma.mcpIdempotencyKey
      .update({
        where: { id: claim.id },
        data: {
          status: "failed",
          result: { error: "operation_failed" },
        },
      })
      .catch(() => null);
    throw error;
  }
}
