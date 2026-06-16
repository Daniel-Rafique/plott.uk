import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { SignatureSettings } from "./signature-settings";

export const dynamic = "force-dynamic";

export default async function SignatureSettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: {
      name: true,
      signatoryTitle: true,
      signatureSvg: true,
      signatureBlobUrl: true,
    },
  });

  return (
    <SignatureSettings
      initial={{
        name: user?.name ?? ctx.user.name ?? "",
        title: user?.signatoryTitle ?? "Director",
        signatureSvg: user?.signatureSvg ?? null,
        signatureBlobUrl: user?.signatureBlobUrl ?? null,
      }}
    />
  );
}
