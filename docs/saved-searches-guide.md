# Saved Searches, Pinned Applications & Email Digests — User Guide

> **Plan Required:** Pro, Agency
> **Cost:** Free (digest summaries use ~£0.005 AI budget per email)

Saved Searches let you monitor specific areas for new planning applications. Instead of manually checking the map every day, the system watches for you and sends email digests when new applications appear.

Pinned Applications monitor one specific planning application and send an email when that application changes.

---

## Overview

The Saved Searches page (`/app/searches`) shows your monitored areas:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Saved searches                                                     │
│  Pin a map area + filters. We'll email your team a digest of new   │
│  leads on schedule.                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SW London Extensions                                        │   │
│  │  Last run: 23 Apr · Found: 12 new applications              │   │
│  │  Frequency: Daily · Notifying: you@company.com              │   │
│  │                                                              │   │
│  │  [✓] Auto-draft outreach letters for new leads              │   │
│  │  Auto-approve when risk ≤ [0.2]                              │   │
│  │                                                              │   │
│  │  [Edit] [Delete]                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Creating a Saved Search

### Step 1: Define Your Area

1. Go to the **Dashboard** (`/app/dashboard`)
2. Navigate to your target area on the map
3. Zoom to show the area you want to monitor
4. The visible map bounds become your search area

### Step 2: Apply Filters (Optional)

Set filters to narrow what you're watching:

| Filter | Example Use |
|--------|-------------|
| **Status** | Only "Pending" applications |
| **Type** | Only "Householder" extensions |
| **Date range** | Applications from last 30 days |

### Step 3: Save the Search

1. Click **"Save search"** in the toolbar
2. Enter a descriptive name (e.g., "Camden Loft Conversions")
3. Choose frequency: **Daily**, **Weekly**, **Monthly**, or **Quarterly**
4. Add email addresses to notify
5. Click **Save**

---

## Understanding Email Digests

### When Digests Are Sent

| Frequency | Timing |
|-----------|--------|
| Daily | ~06:00 UTC each day |
| Weekly | ~06:00 UTC every Monday |
| Monthly | ~06:00 UTC on the 1st of each month |
| Quarterly | ~06:00 UTC on Jan 1, Apr 1, Jul 1, Oct 1 |

### What's in a Digest

Each digest email contains:

- **Count** of new applications since the last run
- **Summary table** with reference, address, description, status
- **Direct links** to view each application in the app
- **Summary** (if enabled) highlighting the most relevant leads

### Who Receives Digests

- All email addresses listed in the "Notify" field
- Multiple addresses can be added (comma-separated)
- Team members don't need app accounts to receive digests

---

## Managing Saved Searches

### Viewing Your Searches

Go to **Searches** (`/app/searches`) to see all your saved searches.

### Editing a Search

1. Find the search in the list
2. Click **"Edit"**
3. Update:
   - Name
   - Frequency (daily/weekly)
   - Notification emails
   - Auto-outreach settings (Agency)
4. Click **Save**

*Note: You cannot change the map bounds after saving. Delete and recreate to change the area.*

### Deleting a Search

1. Click **"Delete"** on the search card
2. Confirm deletion

Deleting a search:
- Stops future digest emails
- Does NOT delete any letters already created
- Does NOT affect outreach approvals already generated

---

## Auto-Outreach (Agency Plan)

> **Plan Required:** Agency
> **Cost:** ~£0.03–0.08 per lead processed

With auto-outreach enabled, new applications trigger the autonomous pipeline:

### Enabling Auto-Outreach

1. Find your saved search
2. Check **"Auto-draft outreach letters for new leads"**
3. Choose what happens when a letter is ready (see below)

### What Happens

For each new application found:

1. **ICP Check** — Does it match your ideal customer profile?
2. **Enrichment** — Find applicant/agent contact details
3. **Draft Letter** — AI writes a personalised letter
4. **Compliance Check** — Scan for GDPR/PECR issues
5. **Queue or Auto-approve** — Based on your setting below

### When a Letter is Ready

Choose how you want to handle AI-drafted letters:

| Option | What Happens |
|--------|--------------|
| **I'll review every letter** | All drafts go to your Outreach inbox for manual approval |
| **Auto-send safe letters only** | Very safe drafts (no compliance issues) go straight to Letters; others need review |
| **Auto-send most letters** | Most drafts auto-approve; only high-risk ones need review |

**Recommendation:** Start with "I'll review every letter" until you're confident in the quality, then switch to "Auto-send safe letters only".

See [Outreach Guide](./outreach-guide.md) for full details.

---

## Best Practices

### 1. Name Searches Descriptively

❌ "Search 1", "Test", "London"

✅ "Islington Extensions Under £100k", "SW London Pending Householder"

### 2. Don't Overlap Areas

If two searches cover the same area, you'll get duplicate notifications. Keep search areas distinct.

### 3. Use Specific Filters

Broad searches (all of London, all types) generate noisy digests. Filter to what's actually relevant to your business.

### 4. Start with Daily, Then Adjust

Daily digests help you understand volume. If it's too much, switch to weekly, monthly, or quarterly depending on your market activity.

### 5. Add Team Members

Include your BD team's emails so everyone sees new leads. They don't need app accounts to receive digests.

---

## Understanding Digest Metrics

Each saved search shows:

| Metric | Meaning |
|--------|---------|
| **Last run** | When the digest job last executed |
| **Found** | Number of new applications in the last run |
| **Frequency** | How often it runs |
| **Notifying** | Who receives the email |

### What "New" Means

An application is "new" if:
- It wasn't in the database at the previous run
- It falls within your search bounds
- It matches your filters

Applications don't appear twice in digests — once notified, they're marked as seen.

---

## Pinned Application Monitoring

Pinned Applications are different from Saved Searches:

| Feature | Watches For | Email Trigger |
|---------|-------------|---------------|
| Saved Search | New applications in a map area/filter set | New matching applications found |
| Pinned Application | Changes to one specific application | A tracked application field changes |

### How to Pin an Application

1. Go to the **Dashboard** (`/app/dashboard`).
2. Open a planning application from the results list or map.
3. Click **Pin application**.
4. The button changes to **Tracking** once the application is pinned.

By default, Plott notifies the email address on your user account. Notification recipients can also be stored on the pinned application record by API.

### What Changes Trigger an Email

Plott stores a snapshot of the application when it is pinned, then compares future checks against that snapshot.

Emails are sent when any of these fields change:

- Application status
- Planning decision
- Decision date
- Site address
- Description
- Council portal/source URL

Each detected change is also recorded as a pinned application event, including the before and after snapshot. If there are no changes, no email is sent.

### Adaptive Check Frequency

The pinned application monitor is scheduled daily, but each pinned application has its own `nextCheckAt` time. This lets the agent check important applications more intelligently instead of polling everything every day.

If a target decision date is available:

| Decision Timing | Check Cadence |
|-----------------|---------------|
| More than 8 weeks away | Weekly |
| 2 to 8 weeks away | Every 3 days |
| Within 2 weeks or overdue | Daily |
| Decided / terminal status | Monthly backoff |

Example: if an application decision is due in 12 weeks, Plott checks weekly at first. Once the due date is within 8 weeks, it checks every 3 days. In the final 2 weeks, and while overdue, it checks daily until a terminal decision is detected.

If no target decision date is known, Plott falls back to the pinned application's configured frequency (`daily`, `weekly`, `monthly`, or `quarterly`).

### Operational Notes

- The production cron route is `/api/cron/pinned-applications`.
- The route is protected by `CRON_SECRET`.
- Email delivery uses the same transactional email system as other Plott notifications.
- `lastCheckedAt` updates after each successful check attempt.
- `lastNotifiedAt` updates only when a change email is sent successfully.

---

## Costs

| Feature | Plan | Cost |
|---------|------|------|
| Saved searches | Pro+ | Free (included) |
| Daily/weekly digests | Pro+ | Free |
| Pinned application monitoring | Pro+ | Free (included) |
| AI digest summary | Pro+ | ~£0.005 per email |
| Auto-outreach processing | Agency | ~£0.03–0.08 per lead |

### Example Monthly Costs

| Scenario | Calculation | Cost |
|----------|-------------|------|
| 5 searches, daily digests | 5 × 30 × £0.005 | ~£0.75 |
| 10 searches, weekly digests | 10 × 4 × £0.005 | ~£0.20 |
| Auto-outreach, 100 leads/month | 100 × £0.05 | ~£5.00 |

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| No digest email | No new applications | Check "Last run" shows a recent date |
| No digest email | Wrong email address | Edit search, verify email spelling |
| No digest email | Email in spam | Check spam/junk folder, whitelist sender |
| Digest shows 0 applications | Filters too restrictive | Broaden filters or widen date range |
| Pinned application email not received | No tracked field changed | Check the application record; routine checks do not send emails |
| Pinned application not checked daily | Adaptive schedule has set a later `nextCheckAt` | This is expected when the decision date is far away |
| Too many applications | Search area too large | Create smaller, focused searches |
| Auto-outreach not triggering | ICP not configured | Settings → AI → fill in ICP profile |
| Auto-outreach not triggering | AI disabled | Settings → AI → enable AI toggle |

---

## Related Guides

- [Dashboard Guide](./dashboard-guide.md) — Searching and pinning individual applications
- [Outreach Guide](./outreach-guide.md) — Autonomous letter generation (Agency)
- [Getting Started](./getting-started.md) — Initial setup
