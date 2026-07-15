import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

async function listNeonAuthUserIdsByEmail(email: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text AS id FROM neon_auth."user" WHERE lower(email) = lower($1)`,
      email,
    );
    return rows.map((r) => r.id);
  } catch (err) {
    logger.warn({ err, email }, "neon_auth_email_lookup_failed");
    return [];
  }
}

export async function neonAuthEmailStillRegistered(
  email: string,
): Promise<boolean> {
  const ids = await listNeonAuthUserIdsByEmail(email);
  return ids.length > 0;
}

async function deleteNeonAuthRowsByUserId(userId: string): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."session" WHERE "userId" = $1::uuid`,
      userId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."account" WHERE "userId" = $1::uuid`,
      userId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."user" WHERE id = $1::uuid`,
      userId,
    );
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "neon_auth_sql_delete_failed");
    return false;
  }
}

async function deleteNeonAuthVerificationByEmail(email: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."verification" WHERE lower(identifier) = lower($1)`,
      email,
    );
  } catch (err) {
    // Table may not exist on older branches.
    logger.warn({ err, email }, "neon_auth_verification_delete_failed");
  }
}

async function deleteNeonAuthViaManagementApi(
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.PLANNING_NEON_PROJECT_ID;
  const branchId = process.env.PLANNING_NEON_BRANCH_ID;
  if (!apiKey || !projectId || !branchId) {
    return {
      ok: false,
      status: 501,
      error:
        "Neon Auth management API is not configured (NEON_API_KEY / PLANNING_NEON_PROJECT_ID / PLANNING_NEON_BRANCH_ID).",
    };
  }

  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/auth/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  if (res.status === 204 || res.status === 404) {
    return { ok: true };
  }

  const body = (await res.json().catch(() => null)) as
    | { message?: string; error?: string }
    | null;
  return {
    ok: false,
    status: res.status,
    error:
      body?.message ??
      body?.error ??
      `Neon Auth management API delete failed with status ${res.status}.`,
  };
}

/**
 * GDPR erasure for Neon Auth identity.
 * Tries SDK + management API, then always email-keyed SQL (session/account/user
 * + verification). Success only when a post-delete SELECT finds no auth user
 * for the email — so signup can reuse the address.
 */
export async function eraseNeonAuthIdentity(options: {
  userId: string;
  email: string;
  password?: string;
}): Promise<{ ok: true; method: string } | { ok: false; error: string }> {
  const email = options.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Account email is missing; cannot erase auth identity." };
  }

  const methods: string[] = [];

  const selfDelete = await auth
    .deleteUser(
      options.password ? { password: options.password } : undefined,
    )
    .catch((error) => ({
      data: null,
      error: {
        message:
          error instanceof Error ? error.message : "Could not delete account.",
        status: 500,
      },
    }));

  if (!selfDelete.error) {
    methods.push("auth.deleteUser");
  } else {
    logger.warn(
      {
        userId: options.userId,
        message: selfDelete.error.message,
        status: selfDelete.error.status,
      },
      "neon_auth_self_delete_failed",
    );
  }

  const managed = await deleteNeonAuthViaManagementApi(options.userId);
  if (managed.ok) {
    methods.push("neon_management_api");
  } else if (managed.status !== 501) {
    logger.warn(
      { userId: options.userId, error: managed.error, status: managed.status },
      "neon_auth_management_delete_failed",
    );
  }

  // Always run email-keyed SQL — do not trust SDK/API alone.
  const ids = new Set<string>([
    options.userId,
    ...(await listNeonAuthUserIdsByEmail(email)),
  ]);

  let sqlOk = false;
  for (const id of ids) {
    if (await deleteNeonAuthRowsByUserId(id)) {
      sqlOk = true;
      methods.push(`neon_auth_sql:${id}`);
    }
  }
  await deleteNeonAuthVerificationByEmail(email);

  if (await neonAuthEmailStillRegistered(email)) {
    return {
      ok: false,
      error:
        (!managed.ok ? managed.error : undefined) ||
        selfDelete.error?.message ||
        (sqlOk
          ? "Neon Auth user row still present after SQL delete."
          : "Could not delete Neon Auth identity (SQL failed)."),
    };
  }

  return {
    ok: true,
    method: methods.length > 0 ? methods.join("+") : "already_absent",
  };
}
