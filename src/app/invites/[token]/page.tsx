import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { upsertUserFromSession } from "@/lib/tenant";
import { SiteHeader } from "@/components/site-header";
import { privatePageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata({
  title: "Team invite",
  description: "Accept a private Plott team invitation.",
});

type Ctx = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Ctx) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { company: true },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">Invite unavailable</h1>
          <p className="mt-2 text-zinc-600">
            This invitation has expired or been revoked. Ask your admin for a
            new one.
          </p>
          <Link href="/" className="mt-6 inline-block underline">
            Back home
          </Link>
        </main>
      </div>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    const next = `/invites/${token}`;
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
      select: { id: true },
    });
    const authPath = existingUser ? "sign-in" : "sign-up";
    redirect(`/auth/${authPath}?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`);
  }

  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">Wrong account</h1>
          <p className="mt-2 text-zinc-600">
            This invite was sent to <strong>{invite.email}</strong>. Sign out
            and sign in with that email to accept.
          </p>
        </main>
      </div>
    );
  }

  // Refuse to materialize a personal Company for an unverified account —
  // otherwise an invitee can skip email verification by entering through the
  // invite link.
  if (!user.emailVerified) {
    const next = `/invites/${token}`;
    redirect(
      `/auth/verify-email?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`,
    );
  }

  const dbUser = await upsertUserFromSession(user);
  await prisma.$transaction([
    prisma.membership.upsert({
      where: {
        userId_companyId: { userId: dbUser.id, companyId: invite.companyId },
      },
      create: {
        userId: dbUser.id,
        companyId: invite.companyId,
        role: invite.role,
      },
      update: { role: invite.role },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: dbUser.id },
      data: { activeCompanyId: invite.companyId },
    }),
  ]);

  redirect("/app/dashboard");
}
