import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import {
  PLOTT_SKILL_INDEX,
  PLOTT_SKILLS,
  registerSkillResources,
} from "@/lib/mcp/skills";

const expectedTools = {
  "research-planning-opportunity": [
    "get_workspace_profile",
    "get_workspace_sales_settings",
    "search_planning_applications",
    "get_planning_application",
    "research_applicant",
  ],
  "qualify-planning-lead": [
    "get_workspace_sales_settings",
    "get_planning_application",
    "estimate_planning_job",
    "upsert_pipeline_lead",
  ],
  "prepare-compliant-outreach": [
    "resolve_outreach_contact",
    "list_workspace_templates",
    "create_letter_draft",
    "check_outreach_compliance",
    "send_approved_outreach",
  ],
} as const;

function authContext(scopes: string[]): McpAuthContext {
  return {
    scopes: new Set(scopes),
    company: { id: "company-1" },
    user: { id: "user-1" },
    membership: { role: "owner" },
    clientId: "client-1",
    jti: "token-1",
    tokenExpiresAt: new Date(Date.now() + 60_000),
  } as McpAuthContext;
}

async function connectedClient(scopes = ["mcp"]) {
  const server = new McpServer(
    { name: "plott-skills-test", version: "1.0.0" },
    { capabilities: { resources: {} } },
  );
  registerSkillResources(server, authContext(scopes));
  const client = new Client({ name: "plott-skills-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("Plott MCP skills", () => {
  it("exposes valid frontmatter and an Agent Skills discovery index", () => {
    expect(PLOTT_SKILLS).toHaveLength(3);
    expect(PLOTT_SKILL_INDEX.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    expect(PLOTT_SKILL_INDEX.skills).toHaveLength(PLOTT_SKILLS.length);

    for (const skill of PLOTT_SKILLS) {
      expect(skill.source).toMatch(/^---\nname: [a-z0-9]+(?:-[a-z0-9]+)*\n/);
      expect(skill.source).toContain(`name: ${skill.name}\n`);
      expect(skill.source).toContain(`description: ${skill.description}\n`);
      expect(skill.uri).toBe(`skill://${skill.name}/SKILL.md`);
      expect(PLOTT_SKILL_INDEX.skills).toContainEqual({
        name: skill.name,
        type: "skill-md",
        description: skill.description,
        url: skill.uri,
      });
    }
  });

  it("references the exact workflow tools and preserves safety language", () => {
    for (const skill of PLOTT_SKILLS) {
      for (const tool of expectedTools[skill.name as keyof typeof expectedTools]) {
        expect(skill.source).toContain(`\`${tool}\``);
      }
    }

    const research = PLOTT_SKILLS.find(
      (skill) => skill.name === "research-planning-opportunity",
    )!;
    const qualify = PLOTT_SKILLS.find(
      (skill) => skill.name === "qualify-planning-lead",
    )!;
    const outreach = PLOTT_SKILLS.find(
      (skill) => skill.name === "prepare-compliant-outreach",
    )!;
    expect(research.source).toContain("explicit confirmation of the external charge");
    expect(qualify.source).toContain("stable unique `idempotencyKey`");
    expect(outreach.source).toContain("fresh, explicit confirmation");
    expect(outreach.source).toContain("Never expose raw enrichment-provider payloads");
  });

  it("lists and reads skill resources over MCP", async () => {
    const { client, server } = await connectedClient();
    try {
      const listed = await client.listResources();
      expect(listed.resources.map((resource) => resource.uri)).toEqual([
        "skill://index.json",
        ...PLOTT_SKILLS.map((skill) => skill.uri),
      ]);

      const index = await client.readResource({ uri: "skill://index.json" });
      expect(JSON.parse(String(index.contents[0]?.text))).toEqual(PLOTT_SKILL_INDEX);

      const skill = PLOTT_SKILLS[0];
      const resource = await client.readResource({ uri: skill.uri });
      expect(resource.contents[0]?.mimeType).toBe("text/markdown");
      expect(resource.contents[0]?.text).toBe(skill.source);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("requires the tenant-bound MCP scope when reading skills", async () => {
    const { client, server } = await connectedClient([]);
    try {
      await expect(
        client.readResource({ uri: "skill://index.json" }),
      ).rejects.toThrow("Scope mcp is required");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
