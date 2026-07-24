import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import { registerCoreTools } from "@/lib/mcp/tools/core";
import { registerWorkspaceTools } from "@/lib/mcp/tools/workspace";
import { registerAiTools } from "@/lib/mcp/tools/ai";

export function createPlottMcpServer(context: McpAuthContext) {
  const server = new McpServer(
    { name: "plott", version: "1.0.0" },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
      },
      instructions:
        "Use Plott tools only within the authorized workspace. Never send outreach without explicit user confirmation.",
    },
  );
  registerCoreTools(server, context);
  registerWorkspaceTools(server, context);
  registerAiTools(server, context);
  return server;
}
