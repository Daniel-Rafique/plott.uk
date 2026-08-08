/**
 * Train / sync Klaviyo Customer Agent from repo content (no UI clicking).
 *
 * Required env:
 *   KLAVIYO_API_KEY  (agents:read + agents:write)
 *
 * Optional:
 *   KLAVIYO_AGENT_API_REVISION  (default 2026-07-15.pre)
 *
 * Usage:
 *   npm run klaviyo:train-customer-agent              # sync + preview
 *   npm run klaviyo:train-customer-agent -- --status
 *   npm run klaviyo:train-customer-agent -- --sync
 *   npm run klaviyo:train-customer-agent -- --preview
 *   npm run klaviyo:train-customer-agent -- --prune   # delete snippet titles not in training-content
 *   npm run klaviyo:train-customer-agent -- --sync --preview
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import {
  AGENT_ID,
  AGENT_NAME,
  guidance,
  knowledgeSnippets,
  knowledgeWebpages,
  previewQuestions,
  skills,
} from "./klaviyo-customer-agent/training-content";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const API_BASE = "https://a.klaviyo.com/api";
const DEFAULT_AGENT_REVISION = "2026-07-15.pre";
const SEARCH_TOOL =
  ':tool[Search Content]{provider="klaviyo" tool="search_content"}';

type Json = Record<string, unknown>;

type Resource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: unknown }>;
};

function parseArgs(argv: string[]) {
  const status = argv.includes("--status");
  const sync = argv.includes("--sync");
  const preview = argv.includes("--preview");
  const prune = argv.includes("--prune");
  const hasFlag = status || sync || preview || prune;
  return {
    status,
    sync: sync || !hasFlag,
    preview: preview || !hasFlag,
    prune,
  };
}

function config() {
  const apiKey = process.env.KLAVIYO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("KLAVIYO_API_KEY is not set (.env or .env.local).");
  }
  return {
    apiKey,
    revision:
      process.env.KLAVIYO_AGENT_API_REVISION?.trim() || DEFAULT_AGENT_REVISION,
  };
}

function headers(cfg: ReturnType<typeof config>, json = true) {
  return {
    Authorization: `Klaviyo-API-Key ${cfg.apiKey}`,
    Accept: "application/vnd.api+json",
    ...(json ? { "Content-Type": "application/vnd.api+json" } : {}),
    revision: cfg.revision,
  };
}

async function klaviyo(
  cfg: ReturnType<typeof config>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${API_BASE}/${path.replace(/^\//, "")}`, {
    method,
    headers: headers(cfg, Boolean(body)),
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json: Json = {};
  if (text) {
    try {
      json = JSON.parse(text) as Json;
    } catch {
      json = { raw: text.slice(0, 800) };
    }
  }
  return { status: res.status, json };
}

function asList(json: Json): Resource[] {
  const data = json.data;
  if (Array.isArray(data)) return data as Resource[];
  if (data && typeof data === "object") return [data as Resource];
  return [];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function syncGuidance(cfg: ReturnType<typeof config>) {
  const { status, json } = await klaviyo(cfg, "PATCH", `customer-agents/${AGENT_ID}`, {
    data: {
      type: "customer-agent",
      id: AGENT_ID,
      attributes: {
        name: AGENT_NAME,
        tone_of_voice: guidance.tone_of_voice,
        communication_styles: guidance.communication_styles,
        escalation_rules: guidance.escalation_rules,
      },
    },
  });
  if (status >= 400) {
    throw new Error(`Guidance sync failed (${status}): ${JSON.stringify(json).slice(0, 800)}`);
  }
  console.log("✔ guidance (tone, styles, escalations)");
}

async function listKnowledge(cfg: ReturnType<typeof config>) {
  const { status, json } = await klaviyo(cfg, "GET", "agent-knowledge");
  if (status >= 400) {
    throw new Error(`List knowledge failed (${status})`);
  }
  return asList(json);
}

async function syncKnowledge(cfg: ReturnType<typeof config>) {
  const existing = await listKnowledge(cfg);
  const byTitle = new Map<string, Resource>();
  for (const item of existing) {
    const source = item.attributes?.source as
      | { source_type?: string; title?: string; url?: string }
      | undefined;
    if (source?.source_type === "snippet" && source.title) {
      byTitle.set(source.title, item);
    }
  }

  for (const sn of knowledgeSnippets) {
    await sleep(250);
    const found = byTitle.get(sn.title);
    if (found) {
      const { status, json } = await klaviyo(cfg, "PATCH", `agent-knowledge/${found.id}`, {
        data: {
          type: "agent-knowledge",
          id: found.id,
          attributes: {
            title: sn.title,
            content: sn.content,
          },
        },
      });
      if (status >= 400) {
        throw new Error(
          `Patch knowledge "${sn.title}" failed (${status}): ${JSON.stringify(json).slice(0, 500)}`,
        );
      }
      console.log(`✔ knowledge snippet updated: ${sn.title}`);
    } else {
      const { status, json } = await klaviyo(cfg, "POST", "agent-knowledge", {
        data: {
          type: "agent-knowledge",
          attributes: {
            source: {
              source_type: "snippet",
              title: sn.title,
              content: sn.content,
            },
          },
        },
      });
      if (status >= 400) {
        throw new Error(
          `Create knowledge "${sn.title}" failed (${status}): ${JSON.stringify(json).slice(0, 500)}`,
        );
      }
      console.log(`✔ knowledge snippet created: ${sn.title}`);
    }
  }

  const urls = new Set(
    existing
      .map((item) => {
        const source = item.attributes?.source as { url?: string } | undefined;
        return source?.url?.replace(/\/$/, "") ?? "";
      })
      .filter(Boolean),
  );

  for (const page of knowledgeWebpages) {
    const normalized = page.url.replace(/\/$/, "");
    if (urls.has(normalized) || urls.has(page.url)) {
      console.log(`· knowledge webpage exists: ${page.url}`);
      continue;
    }
    await sleep(250);
    const { status, json } = await klaviyo(cfg, "POST", "agent-knowledge", {
      data: {
        type: "agent-knowledge",
        attributes: {
          source: {
            source_type: "webpage",
            url: page.url,
            scope: page.scope,
            auto_reindex: true,
          },
        },
      },
    });
    if (status === 409) {
      console.log(`· knowledge webpage conflict (ok): ${page.url}`);
      continue;
    }
    if (status >= 400) {
      console.warn(
        `⚠ knowledge webpage skipped (${status}): ${page.url} — ${JSON.stringify(json).slice(0, 200)}`,
      );
      continue;
    }
    console.log(`✔ knowledge webpage created: ${page.url}`);
  }
}

function skillReferences(existing?: Resource) {
  const refs = existing?.attributes?.references as
    | { tools?: Record<string, { namespace?: string; tool_id?: string; config_params?: unknown }> }
    | undefined;
  const tools = refs?.tools ?? {};
  const keys = Object.keys(tools);
  if (keys.length > 0) {
    const out: Record<
      string,
      { namespace: string; tool_id: string; config_params: Record<string, unknown> }
    > = {};
    for (const k of keys) {
      out[k] = {
        namespace: tools[k]?.namespace || "klaviyo",
        tool_id: tools[k]?.tool_id || "agent_search",
        config_params: (tools[k]?.config_params as Record<string, unknown>) || {},
      };
    }
    return { tools: out };
  }
  return {
    tools: {
      [SEARCH_TOOL]: {
        namespace: "klaviyo",
        tool_id: "agent_search",
        config_params: {},
      },
    },
  };
}

async function listSkills(cfg: ReturnType<typeof config>) {
  const { status, json } = await klaviyo(cfg, "GET", "agent-skills");
  if (status >= 400) {
    throw new Error(`List skills failed (${status})`);
  }
  return asList(json);
}

async function syncSkills(cfg: ReturnType<typeof config>) {
  const existing = await listSkills(cfg);
  const byName = new Map<string, Resource>();
  for (const item of existing) {
    const name = String(item.attributes?.display_name ?? "");
    if (name) byName.set(name, item);
  }

  for (const spec of skills) {
    await sleep(300);
    const found = byName.get(spec.display_name);
    const body = {
      data: {
        type: "agent-skill",
        ...(found ? { id: found.id } : {}),
        attributes: {
          display_name: spec.display_name,
          description: spec.description,
          instructions: spec.instructions,
          status: "live",
          handoff: spec.handoff,
          references: skillReferences(found),
        },
        relationships: {
          "agent-tools": {
            data: [{ type: "agent-tool", id: "klaviyo:agent_search" }],
          },
        },
      },
    };

    if (found) {
      const { status, json } = await klaviyo(
        cfg,
        "PATCH",
        `agent-skills/${found.id}`,
        body,
      );
      if (status >= 400) {
        throw new Error(
          `Patch skill "${spec.display_name}" failed (${status}): ${JSON.stringify(json).slice(0, 800)}`,
        );
      }
      console.log(`✔ skill updated: ${spec.display_name}`);
    } else {
      const { status, json } = await klaviyo(cfg, "POST", "agent-skills", body);
      if (status >= 400) {
        throw new Error(
          `Create skill "${spec.display_name}" failed (${status}): ${JSON.stringify(json).slice(0, 800)}`,
        );
      }
      console.log(`✔ skill created: ${spec.display_name}`);
    }
  }
}

async function pruneKnowledge(cfg: ReturnType<typeof config>) {
  const keep = new Set(knowledgeSnippets.map((s) => s.title));
  const existing = await listKnowledge(cfg);
  for (const item of existing) {
    const source = item.attributes?.source as
      | { source_type?: string; title?: string }
      | undefined;
    if (source?.source_type !== "snippet" || !source.title) continue;
    if (keep.has(source.title)) continue;
    await sleep(200);
    const { status, json } = await klaviyo(
      cfg,
      "DELETE",
      `agent-knowledge/${item.id}`,
    );
    if (status >= 400 && status !== 204) {
      console.warn(
        `⚠ could not delete "${source.title}" (${status}): ${JSON.stringify(json).slice(0, 200)}`,
      );
      continue;
    }
    console.log(`✔ pruned knowledge snippet: ${source.title}`);
  }
}

async function printStatus(cfg: ReturnType<typeof config>) {
  const agent = await klaviyo(cfg, "GET", `customer-agents/${AGENT_ID}`);
  const attrs = (agent.json.data as Resource | undefined)?.attributes ?? {};
  console.log("\n=== Agent ===");
  console.log(JSON.stringify({
    name: attrs.name,
    tone: attrs.tone_of_voice,
    styles: attrs.communication_styles,
    escalations: attrs.escalation_rules,
  }, null, 2));

  console.log("\n=== Skills ===");
  for (const s of await listSkills(cfg)) {
    const a = s.attributes ?? {};
    console.log(
      `${s.id} | ${a.status} | ${a.source} | ${a.display_name}`,
    );
  }

  console.log("\n=== Knowledge ===");
  for (const k of await listKnowledge(cfg)) {
    const source = (k.attributes?.source ?? {}) as {
      source_type?: string;
      title?: string;
      url?: string;
    };
    console.log(
      `${k.id} | ${k.attributes?.status} | ${source.source_type} | ${source.title || source.url || ""}`,
    );
  }
}

async function runPreview(cfg: ReturnType<typeof config>) {
  console.log("\n=== Preview ===");
  for (const q of previewQuestions) {
    await sleep(350);
    const { status, json } = await klaviyo(cfg, "POST", "customer-agent-responses", {
      data: {
        type: "customer-agent-response",
        attributes: {
          mode: "preview",
          channel: "web-chat",
          messages: [{ role: "user", content: q }],
        },
      },
    });
    console.log(`\nQ: ${q}`);
    if (status >= 400) {
      console.log(`HTTP ${status}`, JSON.stringify(json.errors ?? json).slice(0, 400));
      continue;
    }
    const events =
      ((json.data as Resource | undefined)?.attributes?.events as Array<{
        type: string;
        content?: string;
        mode?: string;
        category?: string;
      }>) ?? [];
    for (const e of events) {
      if (e.type === "message" && e.content) {
        const text =
          e.content.length > 420 ? `${e.content.slice(0, 420)}…` : e.content;
        console.log(`A: ${text}`);
      } else if (e.type === "handoff") {
        console.log(`HANDOFF: ${e.mode} ${e.category ?? ""}`.trim());
      } else {
        console.log(`EVENT: ${JSON.stringify(e)}`);
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = config();
  console.log(`Klaviyo Customer Agent training (revision ${cfg.revision})`);

  if (args.sync) {
    console.log("\n=== Sync ===");
    await syncGuidance(cfg);
    await syncKnowledge(cfg);
    await syncSkills(cfg);
  }
  if (args.prune) {
    console.log("\n=== Prune ===");
    await pruneKnowledge(cfg);
  }
  if (args.preview) {
    await runPreview(cfg);
  }
  if (args.status) {
    await printStatus(cfg);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
