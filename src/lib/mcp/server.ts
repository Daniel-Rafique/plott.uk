import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import { registerCoreTools } from "@/lib/mcp/tools/core";
import { registerWorkspaceTools } from "@/lib/mcp/tools/workspace";
import { registerAiTools } from "@/lib/mcp/tools/ai";
import { registerSkillResources } from "@/lib/mcp/skills";

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
        "Use Plott tools only within the authorized workspace. Workflow skills are discoverable at skill://index.json. Never send outreach without explicit user confirmation.",
    },
  );
  registerSkillResources(server, context);
  registerCoreTools(server, context);
  registerWorkspaceTools(server, context);
  registerAiTools(server, context);
  return server;
}
