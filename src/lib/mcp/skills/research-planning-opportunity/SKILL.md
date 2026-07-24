---
name: research-planning-opportunity
description: Research UK planning opportunities with Plott using workspace criteria, grounded application records, and provenance-aware applicant research. Use when finding or investigating planning opportunities.
---

# Research a planning opportunity

Work only in the authorized Plott workspace. Keep application references and source details attached to every finding. Never infer personal contact data.

## Workflow

1. Call `get_workspace_profile` and `get_workspace_sales_settings` to understand the workspace, plan, ICP, rate card, and trade playbooks.
2. If the request is natural language and needs structuring, call `parse_planning_query`. Treat its output as proposed filters, not facts.
3. Search with `search_planning_applications` or `nearby_planning_applications`. Ask for a location or bounds if neither is available.
4. Call `get_planning_application` before making detailed claims about a shortlisted result.
5. When applicant context is relevant, call `research_applicant` using only names and hints returned by Plott. Preserve sources, confidence, and uncertainty.
6. Present a concise shortlist with application reference, site, status, proposal, workspace fit, evidence, and unresolved questions.

## Guardrails

- Do not invent missing application, applicant, ownership, contact, cost, or timeline details.
- Do not call write tools unless the user separately asks to track or qualify a result.
- `lookup_property_title` is optional and metered. Explain why it is useful before calling it.
- Never call `purchase_property_documents` from this research workflow without explicit confirmation of the external charge.
- Never send outreach.
