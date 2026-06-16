import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

export const runtime = "nodejs";

const handler = serve({ client: inngest, functions });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
