/**
 * Tool registry. Shared catalogue assembled into per-agent sets inside the
 * callers so each agent gets only the minimum surface area it needs.
 */

import type { ToolSet } from "ai";
import { planwireLookupTool } from "./planwire";
import { lpaPortalScrapeTool } from "./lpa-portal";
import { lpaRefusalNoticeScrapeTool } from "./lpa-refusal";
import {
  companiesHouseSearchTool,
  companiesHouseProfileTool,
  companiesHouseOfficersTool,
} from "./companies-house";
import { webSearchTool } from "./web-search";
import {
  readEnrichmentCacheTool,
  writeEnrichmentCacheTool,
} from "./enrichment";
import {
  hunterDomainSearchTool,
  hunterEmailFinderTool,
  hunterEmailVerifierTool,
} from "./hunter";
import { makeBrandingTool } from "./branding";
import { makeIcpTool } from "./icp";

export {
  planwireLookupTool,
  lpaPortalScrapeTool,
  lpaRefusalNoticeScrapeTool,
  companiesHouseSearchTool,
  companiesHouseProfileTool,
  companiesHouseOfficersTool,
  webSearchTool,
  readEnrichmentCacheTool,
  writeEnrichmentCacheTool,
  hunterDomainSearchTool,
  hunterEmailFinderTool,
  hunterEmailVerifierTool,
  makeBrandingTool,
  makeIcpTool,
};

/** Full toolbox for enrichment cascades. */
export function enrichmentToolSet(): ToolSet {
  return {
    readEnrichmentCache: readEnrichmentCacheTool,
    writeEnrichmentCache: writeEnrichmentCacheTool,
    planwireLookup: planwireLookupTool,
    lpaPortalScrape: lpaPortalScrapeTool,
    companiesHouseSearch: companiesHouseSearchTool,
    companiesHouseProfile: companiesHouseProfileTool,
    companiesHouseOfficers: companiesHouseOfficersTool,
    hunterDomainSearch: hunterDomainSearchTool,
    hunterEmailFinder: hunterEmailFinderTool,
    hunterEmailVerifier: hunterEmailVerifierTool,
    webSearch: webSearchTool,
  };
}

/** Research-only tools (read-only, no writes back to our DB). */
export function researchToolSet(): ToolSet {
  return {
    companiesHouseSearch: companiesHouseSearchTool,
    companiesHouseProfile: companiesHouseProfileTool,
    companiesHouseOfficers: companiesHouseOfficersTool,
    webSearch: webSearchTool,
  };
}

/** Letter assist / outreach drafting tools. */
export function draftingToolSet(companyId: string): ToolSet {
  return {
    branding: makeBrandingTool(companyId),
    icp: makeIcpTool(companyId),
    readEnrichmentCache: readEnrichmentCacheTool,
  };
}

/** Planning Q&A chatbot tools. */
export function planningQaToolSet(): ToolSet {
  return {
    planwireLookup: planwireLookupTool,
    readEnrichmentCache: readEnrichmentCacheTool,
  };
}

/** Appeal-viability classifier tools — read the refusal notice + web context. */
export function appealsToolSet(): ToolSet {
  return {
    lpaRefusalNoticeScrape: lpaRefusalNoticeScrapeTool,
    webSearch: webSearchTool,
    readEnrichmentCache: readEnrichmentCacheTool,
  };
}
