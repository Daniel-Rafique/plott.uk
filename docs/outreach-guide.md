# Autonomous Outreach Pipeline — User Guide

> **Plan Required:** Agency
> **AI Budget:** Uses your £500/month AI allowance (~£0.03–0.08 per lead)

## What Is It?

The Autonomous Outreach Pipeline automatically drafts personalised outreach letters for planning applications that match your Ideal Customer Profile (ICP). Instead of manually searching for leads and writing letters, the system:

1. **Monitors your saved searches** for new planning applications
2. **Filters** them through your ICP criteria
3. **Enriches** each lead with applicant/agent contact details
4. **Drafts** a branded, personalised letter
5. **Checks compliance** (GDPR, PECR, tone)
6. **Queues for your approval** (or auto-approves if you've configured it)

---

## Plan & Cost Summary

| Aspect | Details |
|--------|---------|
| **Required plan** | Agency |
| **Monthly AI budget** | £500 included |
| **Cost per lead** | ~£0.03–0.08 (ICP check + enrichment + draft + compliance) |
| **Leads per £500** | ~6,000–15,000 depending on complexity |

*Note: If you're on Starter or Pro, you'll see the outreach toggle but it will be disabled with an "Upgrade required" message.*

---

## Prerequisites

| Requirement | Where to Configure |
|-------------|-------------------|
| **Agency plan** | Settings → Billing (outreach requires the top tier) |
| **AI enabled** | Settings → AI → toggle "AI enabled" |
| **ICP configured** | Settings → AI → Ideal Customer Profile section |
| **Saved search with auto-outreach** | Searches → toggle "Auto-draft outreach letters" |
| **Company branding** | Settings → Branding (logo, company name, address) |
| **Inngest + cron (production)** | Vercel: `CRON_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; Inngest app must sync **`/api/inngest`**. Without this, cron cannot queue outreach work. See [Verifying the pipeline](#verifying-the-pipeline-operators) below. |

---

## Step 1: Configure Your Ideal Customer Profile (ICP)

Go to **Settings → AI** (`/app/settings/ai`) and scroll to the "Ideal Customer Profile" section.

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Description** | A plain-English description of the projects you want | "We do loft conversions and rear extensions for detached homes in West London postcodes, typically £80–150k projects." |
| **Preferred keywords** | Comma-separated terms that indicate a good fit | `extension, loft, dormer, conversion` |
| **Excluded keywords** | Terms that disqualify a lead | `commercial, industrial, hoarding, demolition` |
| **Preferred statuses** | Which application statuses you care about | `approved, granted, pending` |
| **Min project value (£)** | Minimum estimated value (optional) | `50000` |

**Why this matters:** The AI classifier reads your ICP before processing each lead. If a planning application doesn't match, it's dropped immediately — saving you AI costs and keeping your inbox relevant.

### Example ICP Descriptions

**For a loft conversion specialist:**
> "We specialise in loft conversions and dormer extensions for Victorian and Edwardian terraced houses in South London boroughs (Lambeth, Southwark, Lewisham, Greenwich). Typical project value £60,000–£120,000. We don't do new builds or commercial work."

**For a general builder:**
> "We handle residential extensions, renovations, and refurbishments across Greater Manchester. Interested in projects from £30,000 upwards. We avoid listed buildings and conservation area work."

**For a roofing contractor:**
> "We're interested in any planning application mentioning roof replacement, re-roofing, or roof extensions. Focus on residential properties in the West Midlands. No industrial or commercial."

---

## Step 2: Create a Saved Search

1. Go to the **Dashboard** (`/app/dashboard`)
2. Navigate the map to your target area (use the 3D view to scout sites)
3. Draw a bounding box around your patch
4. Optionally apply filters:
   - **Status:** Pending, Approved, etc.
   - **Type:** Householder, Full, Prior Approval, etc.
   - **Date range:** Applications from the last N days
5. Click **"Save search"** and give it a descriptive name (e.g., "SW London Extensions")

---

## Step 3: Enable Auto-Outreach on the Saved Search

1. Go to **Searches** (`/app/searches`)
2. Find your saved search in the list
3. Check **"Auto-draft outreach letters for new leads"** (the sparkle icon toggle)
4. Choose **"When a letter is ready"** from the dropdown:

| Option | What Happens |
|--------|--------------|
| **I'll review every letter** | All drafts go to your Outreach inbox for manual approval |
| **Auto-send safe letters only** | Very safe drafts (no compliance issues) go straight to Letters; others need review |
| **Auto-send most letters** | Most drafts auto-approve; only high-risk ones need review |

**Recommendation:** Start with "I'll review every letter" until you're confident in the quality.

---

## Step 4: Wait for the Pipeline to Run

The system runs automatically:

- **Daily** (default), **weekly**, **monthly**, or **quarterly** (configurable per saved search)
- The saved-search cron runs at **07:00 UTC** every day (`vercel.json` — adjust the schedule there if you change hosting)
- Only **new** applications (since the last run) trigger the pipeline
- Up to **50 leads per run** are processed per saved search

### What Happens for Each Lead

| Stage | What Happens | AI Model | Typical Cost |
|-------|--------------|----------|--------------|
| 1. Tier Check | Verify you have Agency plan and AI enabled | — | Free |
| 2. ICP Classification | "Does this match our ICP?" | Claude Haiku | ~£0.001 |
| 3. Contact Enrichment | Find applicant/agent name and address | Claude Sonnet | ~£0.01–0.03 |
| 4. Letter Drafting | Write a personalised outreach letter using your branding | Claude Sonnet | ~£0.02–0.05 |
| 5. Compliance Check | Scan for GDPR/PECR issues, risky language | Claude Haiku | ~£0.002 |
| 6. Queue for Approval | Create a pending approval record | — | Free |

**Total cost per lead:** approximately £0.03–0.08 depending on complexity.

---

## Step 5: Review Drafts in the Outreach Inbox

Go to **Outreach** (`/app/outreach`) to see your approval queue.

### The Inbox Layout

The page is split into two panels:

**Left panel — Queue list:**
- Filter by status: Pending, Approved, Rejected, All
- Shows reference number, recipient name, and subject preview
- Click any item to view details

**Right panel — Draft details:**
- Full letter preview (formatted HTML)
- Recipient name and address
- Compliance issues (if any)
- AI model used and cost
- Approve/Reject buttons

### For Each Draft You Can See

| Field | Description |
|-------|-------------|
| **Subject** | AI-generated letter subject line |
| **Recipient** | The applicant or planning agent name |
| **Address** | Postal address for the letter |
| **Letter body** | Full HTML preview of the drafted letter |
| **Compliance issues** | Warnings (amber) or errors (red) from the guardrail |
| **Model & cost** | Which AI model drafted it and the cost in GBP |
| **Research briefing** | Quick company/person lookup card (if data available) |
| **Timestamp** | When the draft was generated |

---

## Step 6: Approve or Reject

### To Approve a Draft

1. Review the letter content carefully
2. Check that the recipient name is correct
3. Verify the postal address is complete
4. Review any compliance warnings (amber boxes)
5. Click **"Approve & draft letter"**

**What happens next:** The draft is converted to a Letter record and appears in `/app/letters`. You can then download the PDF, print it, and post it.

### To Reject a Draft

1. Click **"Reject"**
2. Optionally enter a reason (e.g., "Wrong recipient", "Not relevant to our services")
3. Click confirm

**What happens next:** The draft is archived with "rejected" status. It won't become a letter. Your rejection notes help you spot patterns — if you're rejecting many drafts for the same reason, consider tightening your ICP.

---

## Step 7: Print or Send the Letter

Once approved, the letter appears in **Letters** (`/app/letters`).

From the Letters table you can:

| Action | What It Does |
|--------|--------------|
| **Download PDF** | Get a print-ready PDF with your branding, ready to post |
| **Mark as sent** | Update the status to track your outreach |
| **Schedule reminder** | Set a follow-up date to chase if no response |
| **View details** | See the full letter, recipient info, and history |

---

## Understanding Compliance Issues

The compliance guardrail automatically checks every draft for potential problems:

| Issue Code | Severity | What It Means | What to Do |
|------------|----------|---------------|------------|
| `no_opt_out` | Warning | Letter doesn't include an unsubscribe/opt-out line | Add one before sending (PECR requirement) |
| `implies_relationship` | Error | Letter suggests you already know the recipient | Reject — this violates cold-outreach rules |
| `invented_services` | Error | Letter mentions services not in your branding | Reject or edit — don't make false claims |
| `aggressive_tone` | Warning | Language may come across as pushy or salesy | Review and soften if needed |
| `pii_leak` | Error | Letter contains inappropriate personal data | Reject — potential GDPR issue |
| `missing_sender` | Warning | Your company details aren't complete | Update Settings → Branding |

**General guidance:**
- **Errors (red):** Should generally be rejected or require significant editing
- **Warnings (amber):** Review carefully, but may be acceptable

---

## Costs & Budget Management

### Understanding AI Costs

Each stage of the pipeline consumes AI tokens, which are billed to your workspace:

| Stage | Model | Typical Cost |
|-------|-------|--------------|
| ICP Classification | Claude 3 Haiku | £0.0005–0.002 |
| Contact Enrichment | Claude 3 Sonnet | £0.01–0.03 |
| Letter Drafting | Claude 3 Sonnet | £0.02–0.05 |
| Compliance Check | Claude 3 Haiku | £0.001–0.003 |

**Total per lead processed:** £0.03–0.08

### Monitoring Your Spend

Go to **Settings → AI** (`/app/settings/ai`) to see:

- **Daily spend** vs. your daily budget (with progress bar)
- **Monthly spend** vs. your plan's monthly cap
- **Run count** — how many AI operations ran today
- **Token count** — total tokens consumed

### Budget Controls

| Setting | What It Does |
|---------|--------------|
| **Daily budget (£)** | Hard stop — AI features pause when reached |
| **Monthly cap** | Set by your plan tier — cannot be exceeded |
| **AI enabled toggle** | Master switch to disable all AI features |

**Tip:** Set your daily budget to ~1/20th of your monthly cap to spread usage evenly.

---

## Tips for Best Results

### 1. Be Specific in Your ICP Description

❌ **Too vague:** "We do building work in London"

✅ **Specific:** "We specialise in rear and side return extensions for Victorian terraces in Islington, Hackney, and Tower Hamlets. Typical project value £80,000–£150,000. We don't do lofts or new builds."

### 2. Use Excluded Keywords Liberally

It's much cheaper to drop leads at the ICP stage than to draft letters you'll reject. Common exclusions:
- `commercial`, `industrial`, `retail`
- `listed building`, `conservation area` (if you avoid these)
- `demolition`, `change of use`
- `hoarding`, `advertisement`, `signage`

### 3. Start with Manual Approval

Don't enable auto-approve until you've manually reviewed at least 20–30 drafts and are confident in:
- Your ICP configuration
- Your branding completeness
- The letter quality

### 4. Set a Conservative Auto-Approve Threshold

If you do enable auto-approve:
- Start with `0.15` (only the safest drafts)
- Increase gradually as you gain confidence
- Never exceed `0.4` — higher risk scores need human review

### 5. Review Rejection Patterns

If you find yourself rejecting drafts for the same reason repeatedly:
- **"Not our type of work"** → Tighten your ICP description and keywords
- **"Wrong person"** → Enrichment data may be incomplete for that LPA
- **"Letter tone wrong"** → Update your branding with tone guidelines

---

## Verifying the pipeline (operators)

Use this to confirm autonomous outreach is wired end-to-end in a **deployed** environment. Local dev does not run Vercel Cron automatically; trigger the route manually if needed (see below).

1. **Vercel** — Cron invocations for `/api/cron/saved-searches` return **200** (not 401). Ensure `CRON_SECRET` is set and matches the cron configuration.
2. **Vercel logs** — Search for these logger event names from `src/app/api/cron/saved-searches/route.ts`:
   - `cron_outreach_events_dispatched` — events were sent to Inngest (`eventCount` in context).
   - `cron_inngest_dispatch_failed` — Inngest rejected or `INNGEST_EVENT_KEY` missing/invalid; fix keys and redeploy. New leads are **not** marked seen until dispatch succeeds (next cron retries).
   - `cron_outreach_skipped_requires_agency_tier` — workspace is not on Agency for outbound events.
   - `cron_outreach_skipped_ai_disabled` — turn on AI for the workspace.
   - `cron_no_new_applications` — no new PlanWire rows since last run (expected in quiet areas).
   - `cron_saved_search_results` — inspect `newCount` / `totalFound`.
3. **Inngest** — Events named `outreach/lead.discovered` appear, and function **`outreach-lead-discovered`** runs. The app URL must include **`/api/inngest`** as the sync endpoint with a valid signing key (`INNGEST_SIGNING_KEY`).
4. **Database** — `AgentApproval` rows with `kind = outreach_letter` for the company (what `/app/outreach` lists).

**Manual cron trigger (e.g. staging):** `GET /api/cron/saved-searches` with header `Authorization: Bearer <CRON_SECRET>`. You still need the Inngest dev server or cloud app processing `/api/inngest` for approvals to appear.

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| No drafts appearing | ICP not configured | Settings → AI → fill in your Ideal Customer Profile |
| No drafts appearing | AI disabled | Settings → AI → enable the "AI enabled" toggle |
| No drafts appearing | Wrong subscription plan | Outreach requires the Agency plan — upgrade in Settings → Billing |
| No drafts appearing | No new applications | Pipeline only processes *new* leads since the last run |
| No drafts appearing | Saved search doesn't have auto-outreach | Searches → enable "Auto-draft outreach letters" toggle |
| No drafts appearing | Inngest or cron misconfigured | Set `CRON_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; register `/api/inngest` in Inngest. Check logs for `cron_inngest_dispatch_failed` |
| All leads being dropped | ICP too restrictive | Broaden your description or remove some excluded keywords |
| Irrelevant leads appearing | ICP too broad | Add more excluded keywords, be more specific in description |
| Letters missing addresses | Enrichment failed | Some LPAs don't publish applicant addresses — this is expected |
| Compliance errors on every draft | Branding incomplete | Settings → Branding — fill in company name, address, services |
| "No ICP profile configured" error | ICP description empty | Settings → AI → enter at least a description |
| Budget exhausted | Hit daily or monthly limit | Wait for reset, or increase budget in Settings → AI |

---

## FAQ

**Q: How quickly do drafts appear after a new application is published?**

A: The pipeline runs on a schedule (daily by default). New applications are picked up on the next scheduled run, typically within 24 hours.

**Q: Can I edit a draft before approving?**

A: Currently, you approve or reject the draft as-is. After approval, you can edit the letter in the Letters section before printing.

**Q: What happens if enrichment can't find a contact?**

A: The pipeline will still draft a letter addressed to "Sir or Madam" with the site address. You can reject these if you prefer named contacts only.

**Q: Can I run the pipeline manually?**

A: The schedule is automated, but operators can trigger **`GET /api/cron/saved-searches`** with `Authorization: Bearer <CRON_SECRET>` (e.g. staging). You still need Inngest running against **`/api/inngest`** for drafts to reach the database.

**Q: How do I stop getting drafts for a specific area?**

A: Either delete the saved search, or disable the "Auto-draft outreach letters" toggle on that search.

**Q: Are the letters GDPR compliant?**

A: The system drafts letters using legitimate interest as the legal basis and includes opt-out instructions. However, you are responsible for ensuring your outreach complies with applicable regulations.

---

## Related Pages

- **Dashboard** (`/app/dashboard`) — Search and explore planning applications
- **Searches** (`/app/searches`) — Manage saved searches and auto-outreach settings
- **Letters** (`/app/letters`) — View, print, and track approved letters
- **Settings → AI** (`/app/settings/ai`) — Configure ICP and budget
- **Settings → Branding** (`/app/settings/branding`) — Upload logo and company details
