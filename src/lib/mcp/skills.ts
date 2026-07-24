import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import { requireScope } from "@/lib/mcp/auth-context";

const SKILL_INDEX_SCHEMA =
  "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

const skillSources = [
  readFileSync(
    new URL("./skills/research-planning-opportunity/SKILL.md", import.meta.url),
    "utf8",
  ),
  readFileSync(
    new URL("./skills/qualify-planning-lead/SKILL.md", import.meta.url),
    "utf8",
  ),
  readFileSync(
    new URL("./skills/prepare-compliant-outreach/SKILL.md", import.meta.url),
    "utf8",
  ),
] as const;

export type PlottSkill = {
  name: string;
  description: string;
  uri: `skill://${string}/SKILL.md`;
  source: string;
};

function frontmatterValue(source: string, key: string): string {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  const value = frontmatter
    ?.split("\n")
    .find((line) => line.startsWith(`${key}:`))
    ?.slice(key.length + 1)
    .trim();
  if (!value) throw new Error(`Plott MCP skill is missing ${key} frontmatter`);
  return value;
}

function parseSkill(source: string): PlottSkill {
  const name = frontmatterValue(source, "name");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid Plott MCP skill name: ${name}`);
  }
  return {
    name,
    description: frontmatterValue(source, "description"),
    uri: `skill://${name}/SKILL.md`,
    source,
  };
}

export const PLOTT_SKILLS = skillSources.map(parseSkill);

export const PLOTT_SKILL_INDEX = {
  $schema: SKILL_INDEX_SCHEMA,
  skills: PLOTT_SKILLS.map(({ name, description, uri }) => ({
    name,
    type: "skill-md" as const,
    description,
    url: uri,
  })),
};

export function registerSkillResources(
  server: McpServer,
  context: McpAuthContext,
) {
  server.registerResource(
    "skill-index",
    "skill://index.json",
    {
      title: "Plott Agent Skills",
      description: "Index of workflow skills provided by the Plott MCP server.",
      mimeType: "application/json",
    },
    async (uri) => {
      requireScope(context, "mcp");
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(PLOTT_SKILL_INDEX),
          },
        ],
      };
    },
  );

  for (const skill of PLOTT_SKILLS) {
    server.registerResource(
      `skill-${skill.name}`,
      skill.uri,
      {
        title: skill.name,
        description: skill.description,
        mimeType: "text/markdown",
      },
      async (uri) => {
        requireScope(context, "mcp");
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "text/markdown",
              text: skill.source,
            },
          ],
        };
      },
    );
  }
}
