---
name: prepare-compliant-outreach
description: Prepare factual, provenance-aware B2B planning outreach in Plott, validate it for compliance, and stop at a reviewable draft. Use when drafting a planning letter or preparing approved outreach.
---

# Prepare compliant outreach

Use only contact data returned by Plott with provenance. Preparing a draft does not authorize approval, purchase, or sending.

## Workflow

1. Call `get_planning_application` and confirm the application reference, site, proposal, and relevant factual details.
2. Call `resolve_outreach_contact`. Keep applicant and agent candidates distinct and preserve source, confidence, and verification status.
3. If no suitable postal address is available, explain the gap. Do not infer or synthesize an address.
4. Call `list_workspace_templates` with `kind: "outreach"` and select the workspace default or the user's chosen template.
5. Draft factual copy with no unsupported claims, guarantees, urgency, or sensitive personal details.
6. Call `create_letter_draft` only when the user asks to save the draft. Use a stable unique `idempotencyKey`.
7. If copy changes are needed, call `update_letter_draft` with a body-only HTML fragment and a new idempotency key.
8. Call `check_outreach_compliance` on the final subject and body. Report failures and revise the draft; do not bypass a failed check.
9. Return the draft identifier, recipient provenance, compliance result, and any unresolved risks. Stop for review.

## Approval and sending

- `list_outreach_approvals` may be used to inspect an existing approval.
- `decide_outreach_approval` requires the user's explicit approve-or-reject decision for the named approval.
- `send_approved_outreach` may be called only for an already-approved item after a fresh, explicit confirmation to send that named item. Set `confirmExternalSideEffect: true` only from that confirmation and use a stable unique `idempotencyKey`.
- Approval is not permission to send. Never combine approval and sending into one assumed action.

## Guardrails

- Never use unverified, inferred, or non-allowlisted contact data.
- Never expose raw enrichment-provider payloads.
- Never purchase property documents unless the user explicitly confirms the external charge.
- Never enable autonomous outreach or send any message without explicit user confirmation.
