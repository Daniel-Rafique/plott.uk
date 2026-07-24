import { oauthJwks } from "@/lib/mcp/oauth/tokens";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await oauthJwks(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
