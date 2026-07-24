---
name: qualify-planning-lead
description: Qualify a Plott planning application against workspace sales criteria, estimate the opportunity, and prepare an evidence-based pipeline action. Use when assessing whether an application is a worthwhile lead.
---

# Qualify a planning lead

Separate observed planning data from Plott AI estimates and recommendations. Read-only qualification is the default; workspace writes require the user's request.

## Workflow

1. Call `get_workspace_sales_settings` for the ICP, rate card, and trade playbooks.
2. Resolve the target with `get_planning_application`. If no reference is known, use `search_planning_applications` first and ask the user to choose when multiple records plausibly match.
3. Call `research_applicant` only when applicant or company context affects qualification.
4. Call `estimate_planning_job` when the application contains enough evidence for an indicative estimate. Clearly label assumptions, ranges, and missing inputs.
5. Summarize:
   - application reference and site;
   - scope and status;
   - ICP and playbook fit;
   - indicative value and assumptions;
   - evidence, confidence, risks, and recommended next action.
6. Only when requested, call `upsert_pipeline_lead` to create or advance the lead, or `pin_application` to track planning changes. Use a stable unique `idempotencyKey` for each intended write.

## Guardrails

- Do not advance a stage, overwrite notes, assign a user, or pin an application merely because it scored well.
- Before changing an existing lead, use `list_pipeline_leads` to identify it and then call `update_pipeline_lead` only for fields the user requested.
- Do not present `estimate_planning_job` output as a quote, survey, or guaranteed contract value.
- Property ownership is not required for qualification. Do not purchase property documents without explicit confirmation of the external charge.
- Never send outreach.
