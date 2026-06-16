# Dashboard & Map Search — User Guide

> **Plan Required:** All plans (some features limited on Starter)
> **Search Limits:** Starter: 25/day | Pro & Agency: Unlimited

The Dashboard is your main workspace for discovering and exploring UK planning applications. This guide covers the 3D map, search tools, filters, and application details.

---

## Overview

The Dashboard (`/app/dashboard`) has three main areas:

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Search box]  [Filters ▼]  [2D/3D toggle]                         │
├──────────────────────┬──────────────────────────────────────────────┤
│                      │                                              │
│   Results List       │              3D Map View                     │
│   (sidebar)          │                                              │
│                      │         📍 Planning application pins         │
│   • Application 1    │                                              │
│   • Application 2    │                                              │
│   • Application 3    │                                              │
│   ...                │                                              │
│                      │                                              │
│   [Pagination]       │                                              │
│                      │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

---

## The 3D Map

### Navigation

| Action | Mouse | Trackpad |
|--------|-------|----------|
| Pan | Left-click + drag | Two-finger drag |
| Rotate | Right-click + drag | Ctrl + two-finger drag |
| Zoom | Scroll wheel | Pinch |
| Tilt | Ctrl + scroll | — |

### What You See

- **Photorealistic 3D buildings** — Actual building geometry and textures
- **Planning pins** — Coloured markers for each application
- **Street context** — Roads, landmarks, neighbouring properties

### Pin Colours

| Colour | Meaning |
|--------|---------|
| 🟢 Green | Approved / Granted |
| 🟡 Yellow | Pending Decision |
| 🔴 Red | Refused |
| ⚪ Grey | Withdrawn / Other |

### Switching Views

Toggle between:
- **3D View** — Photorealistic, good for site assessment
- **2D View** — Traditional map, faster for scanning large areas

---

## Searching

### Basic Search

Type in the search box to find applications by:
- **Address** — "42 High Street, Camden"
- **Postcode** — "NW1 8JR"
- **Reference number** — "2024/1234/FUL"
- **Description keywords** — "loft conversion dormer"

### Natural Language Search (AI)

> **Plan Required:** All plans
> **Cost:** ~£0.001 per query

Type questions in plain English:
- "Show me approved extensions in Islington from the last 3 months"
- "Find pending loft conversions near King's Cross"
- "Applications for rear extensions over £50k"

The AI translates your query into precise filters.

### Search by Map Area

1. Navigate to your target area
2. The map automatically loads applications in the visible area
3. Zoom in/out to expand or narrow your search

---

## Filters

Click the **Filters** button to refine results:

### Status Filter

| Status | What It Means |
|--------|---------------|
| Pending | Awaiting decision |
| Approved / Granted | Permission given |
| Refused | Application rejected |
| Withdrawn | Applicant withdrew |
| Appeal | Under appeal |

### Application Type Filter

| Type | Description |
|------|-------------|
| Householder | Extensions, alterations to existing homes |
| Full | New builds, major works |
| Prior Approval | Permitted development checks |
| Listed Building | Works to listed buildings |
| Conservation | Works in conservation areas |
| Outline | Principle of development only |

### Date Range Filter

- **Received date** — When the council received the application
- **Decision date** — When a decision was made
- Presets: Last 7 days, 30 days, 90 days, custom range

---

## Results List

The sidebar shows matching applications:

### Each Result Shows

- **Reference** — Council reference number (e.g., "2024/1234/FUL")
- **Address** — Site location
- **Description** — Brief summary of proposed works
- **Status** — Current application status
- **Applicant** — Name (if available from enrichment)

### Sorting

Click column headers to sort by:
- Date (newest/oldest)
- Status
- Distance from map centre

### Pagination

Results are paginated (50 per page). Use the controls at the bottom to navigate.

---

## Application Details Panel

Click any result or map pin to open the details panel:

### Information Displayed

| Section | Contents |
|---------|----------|
| **Header** | Reference, status badge, address |
| **Description** | Full description of proposed works |
| **Key Dates** | Received, validated, decision, target |
| **Applicant** | Name, address (if enriched) |
| **Agent** | Planning agent details (if available) |
| **Case Officer** | LPA contact (if available) |
| **Documents** | Link to council planning portal |

### Actions Available

| Action | What It Does | Plan Required |
|--------|--------------|---------------|
| **Write letter** | Create an outreach letter | All |
| **Pin application** | Track this specific application and email on changes | Paid plans |
| **Save to list** | Add to a collection | All |
| **View on portal** | Open council website | All |
| **Research applicant** | AI company/person briefing | Pro+ |
| **Ask AI** | Open Q&A chat for this application | All |

---

## Pinning Applications

> **Plan Required:** Paid plans

Use **Pin application** when you want Plott to watch one specific planning application, not a whole search area. This is useful for pending applications where the outcome matters to your pipeline.

### What Happens When You Pin

1. Plott saves the application's current snapshot: reference, council, address, description, status, decision, decision date, and portal link.
2. Your account email is added as the default notification recipient.
3. The monitoring agent checks the council/Planwire record on schedule.
4. If any tracked field changes, Plott records an event and emails the notification recipients.

Tracked changes include:

- Status changes, such as pending to decided
- Decision changes, such as granted or refused
- Decision date changes
- Site address changes
- Description changes
- Council portal/source URL changes

### Check Frequency

Pinned applications use an adaptive schedule. If a target decision date is known, Plott checks less often when the decision is far away and more often near the due date:

| Time Until Target Decision | Check Cadence |
|----------------------------|---------------|
| More than 8 weeks | Weekly |
| 2 to 8 weeks | Every 3 days |
| Final 2 weeks or overdue | Daily |
| Decided / terminal status | Monthly backoff |

For example, if a decision is expected in about 12 weeks, Plott checks weekly at first, then increases frequency as the decision window approaches.

Emails are sent only when the application data changes. A routine check with no changes does not send an email.

---

## AI Features on the Dashboard

### Planning Q&A Chat

> **Plan Required:** All plans
> **Cost:** ~£0.01 per conversation

Click the **AI chat** icon to ask questions about any application:

**Example questions:**
- "Summarise this application in plain English"
- "What stage is this at and what happens next?"
- "Who is the applicant and are they a company?"
- "Any risk flags I should know about?"

The AI has access to the application data and can fetch additional context.

### Research Briefings

> **Plan Required:** Pro, Agency
> **Cost:** ~£0.03 per briefing

When viewing an application, click **"Research applicant"** to get:
- Company information (if corporate applicant)
- Director details
- Other planning history
- Estimated project value

---

## Saving Searches

> **Plan Required:** Pro, Agency

To save a search area for monitoring:

1. Navigate to your target area
2. Apply any filters you want
3. Click **"Save search"**
4. Name your search (e.g., "SW London Extensions")
5. Choose digest frequency (daily/weekly/monthly/quarterly)
6. Enter email addresses to notify

Saved searches are managed in `/app/searches`.

See [Saved Searches Guide](./saved-searches-guide.md) for details.

---

## Exporting Data

### CSV Export

> **Plan Required:** All plans

1. Run your search
2. Click **"Export CSV"**
3. Download a spreadsheet with:
   - Reference numbers
   - Addresses
   - Descriptions
   - Statuses
   - Dates
   - Applicant details (if enriched)

### Bulk Letter Generation

> **Plan Required:** Agency

1. Select multiple applications (checkbox)
2. Click **"Generate letters"**
3. Download a ZIP file with individual PDFs

---

## Usage Limits

### Search Limits by Plan

| Plan | Daily Searches | Notes |
|------|----------------|-------|
| Starter | 25 | Counter resets at midnight UTC |
| Pro | Unlimited | — |
| Agency | Unlimited | — |

### What Counts as a Search?

- Loading a new map area
- Changing filters
- Using natural language search

*Scrolling/panning within a loaded area doesn't count.*

### AI Budget Usage

AI features consume from your monthly budget:

| Feature | Typical Cost | Example Usage |
|---------|--------------|---------------|
| NL Search | £0.001 | 25,000 queries on Starter |
| Q&A Chat | £0.01 | 2,500 conversations on Starter |
| Research | £0.03 | 3,300 briefings on Pro |

---

## Tips for Effective Searching

### 1. Start Wide, Then Narrow

Begin with a large map area, then zoom in on promising clusters.

### 2. Use Status Filters Strategically

- **Pending** — Best for early outreach (applicant actively planning)
- **Approved** — Good for construction-phase services
- **Refused** — Opportunity for revised proposals

### 3. Save Repetitive Searches

If you search the same area regularly, save it as a monitored search to get automatic email digests.

### 4. Pin High-Value Pending Applications

For applications you care about individually, use **Pin application** so Plott emails you when the status, decision, decision date, address, description, or portal link changes.

### 5. Use 3D View for Site Assessment

The photorealistic 3D view helps you:
- Assess site access
- See neighbouring buildings
- Understand roof/extension potential
- Spot constraints (trees, boundaries)

### 6. Combine with Q&A

When you find an interesting application, use the AI chat to quickly understand:
- What's being proposed
- Whether it's relevant to your services
- Who to contact

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Map won't load | WebGL not supported | Try a different browser (Chrome recommended) |
| No results showing | Filters too restrictive | Remove filters, widen date range |
| "Search limit reached" | Daily quota exceeded | Wait until midnight UTC, or upgrade plan |
| Applicant details missing | Not enriched yet | Pro/Agency: click "Enrich" to fetch details |
| 3D buildings not showing | Zoom level too low | Zoom in closer to see building geometry |

---

## Related Guides

- [Letters Guide](./letters-guide.md) — Creating and sending letters
- [Saved Searches Guide](./saved-searches-guide.md) — Monitoring areas over time
- [Outreach Guide](./outreach-guide.md) — Autonomous letter generation (Agency)
