# Settings — User Guide

This guide covers all settings pages and their configuration options.

---

## Settings Overview

| Setting Page | Location | What It Controls |
|--------------|----------|------------------|
| **Branding** | `/app/settings/branding` | Company logo, name, address, footer |
| **Templates** | `/app/settings/templates` | Reusable letter templates |
| **Signature** | `/app/settings/signature` | Your digital signature |
| **Team** | `/app/settings/team` | Team members and invitations |
| **AI** | `/app/settings/ai` | AI features, budget, ICP profile |
| **Billing** | `/app/settings/billing` | Subscription and payment |

---

## Branding Settings

> **Location:** Settings → Branding
> **Plan Required:** All plans

Your branding appears on every letter you generate.

### Company Details

| Field | Where It Appears | Required |
|-------|------------------|----------|
| **Company name** | Letter header, footer | Yes |
| **Address** | Letter header (sender address) | Yes |
| **Phone** | Letter footer | No |
| **Email** | Letter footer | No |
| **Website** | Letter footer | No |

### Logo

- **Formats:** PNG, JPG, SVG
- **Recommended size:** 300×100 pixels (landscape)
- **Max file size:** 2MB
- **Placement:** Top-left of letter header

### Letter Footer

Custom text that appears at the bottom of every letter. Good for:
- Company registration number
- VAT number
- Professional accreditations
- Legal disclaimers

**Example:**
```
Registered in England & Wales No. 12345678 | VAT No. GB 123 4567 89
Member of the Federation of Master Builders
```

---

## Letter Templates

> **Location:** Settings → Templates
> **Plan Required:** All plans

Templates save time when writing similar letters repeatedly.

### Creating a Template

1. Click **"+ New template"**
2. Enter:
   - **Name** — Internal name (e.g., "Standard Introduction")
   - **Subject** — The RE: line of the letter
   - **Body** — The letter content (HTML supported)
3. Click **Save**

### Template Variables

Use placeholders that auto-fill when applied:

| Variable | Replaced With |
|----------|---------------|
| `{{recipient_name}}` | Recipient's name |
| `{{site_address}}` | Application site address |
| `{{reference}}` | Planning reference number |
| `{{description}}` | Application description |
| `{{company_name}}` | Your company name |
| `{{sender_name}}` | Your name |
| `{{date}}` | Today's date |

**Example template:**

```html
<p>Dear {{recipient_name}},</p>

<p>I noticed your recent planning application ({{reference}}) for works at 
{{site_address}} and thought I'd reach out.</p>

<p>At {{company_name}}, we specialise in exactly this type of project and 
would be delighted to discuss how we might help.</p>

<p>Would a brief call or site visit be useful?</p>

<p>Best regards,<br/>
{{sender_name}}</p>
```

### Default Template

Mark one template as **default** to have it auto-selected when creating new letters.

### Managing Templates

- **Edit** — Update name, subject, or body
- **Duplicate** — Create a copy to modify
- **Delete** — Remove unused templates
- **Set as default** — Auto-select for new letters

---

## Signature Settings

> **Location:** Settings → Signature
> **Plan Required:** Pro, Agency

Your digital signature appears on letters above your name.

### Option 1: Draw Your Signature

1. Use your mouse or trackpad on the canvas
2. Click **"Clear"** to start over
3. Click **"Save"** when happy

**Tips:**
- Use a stylus for best results
- Sign naturally — don't try to be perfect
- Dark colours work best (black or dark blue)

### Option 2: Upload an Image

1. Click **"Upload"**
2. Select a PNG file (transparent background recommended)
3. The image is saved automatically

**Image requirements:**
- Format: PNG (transparency supported)
- Recommended: 400×150 pixels
- Max file size: 1MB

### Signatory Title

Your title appears below your signature:

```
[Signature image]
John Smith
Director
```

Common titles: Director, Managing Director, Owner, Partner, Manager

---

## Team Settings

> **Location:** Settings → Team
> **Plan Required:** Pro (3 seats), Agency (unlimited)

Manage who has access to your workspace.

### Team Seats by Plan

| Plan | Price | Included Seats |
|------|-------|----------------|
| Starter | £49.99/month | 1 |
| Pro | £99/month | 3 |
| Agency | £199/month | 10 |

### Inviting Team Members

1. Click **"Invite member"**
2. Enter their email address
3. Select a role:
   - **Admin** — Full access including settings
   - **Member** — Can use all features, cannot change settings
4. Click **Send invite**

The invitee receives an email with a link to join.

### Managing Members

| Action | What It Does |
|--------|--------------|
| **Change role** | Promote/demote between Admin and Member |
| **Remove** | Revoke access (they can no longer sign in) |
| **Resend invite** | Send another invitation email |

### Pending Invitations

Invitations expire after 7 days. Expired invitations show as "Expired" and can be resent.

---

## AI Settings

> **Location:** Settings → AI
> **Plan Required:** All plans (features vary)

Control AI features and spending.

### AI Enabled Toggle

Master switch for all AI features. When off:
- No AI queries are processed
- No AI budget is consumed
- Natural language search falls back to keyword matching
- Letter assist is disabled
- Outreach pipeline pauses

### Daily Budget

Set a daily spending limit (in GBP):

| Setting | Effect |
|---------|--------|
| £0 | AI disabled for the day |
| £1–5 | Light usage (few queries) |
| £10–20 | Moderate usage (typical) |
| £50+ | Heavy usage (bulk operations) |

When the daily budget is reached:
- AI features stop working
- You receive an email warning at 80%
- Resets at midnight UTC

### Monthly included AI allowance

The **included** AI amount for your plan comes from Stripe Price metadata (`ai_monthly_budget_gbp`) and may differ from marketing copy. Typical configured values:

| Plan | Example included AI (GBP/month) |
|------|--------------------------------|
| Starter | £10 |
| Pro | £25 |
| Agency | £100 |

Usage **within** this allowance is included. Usage **beyond** it is reported for **metered billing** and appears on your next invoice (see **Settings → Billing** for spend vs included amount). A separate **daily** budget in AI settings still applies as a safety limit on how much can run in a rolling 24-hour window.

### Usage Dashboard

The AI settings page shows:

- **Runs (24h)** — Number of AI operations today
- **Spend (24h)** — Cost in GBP today
- **Tokens (24h)** — Total tokens consumed today
- **Monthly progress** — Spend vs. monthly cap

### Ideal Customer Profile (ICP)

> **Plan Required:** Pro+ for ICP classification, Agency for outreach

Define the projects you want to hear about. Used by:
- ICP classifier (filters leads automatically)
- Outreach pipeline (only drafts letters for matching leads)

**Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| **Description** | Plain-English description of ideal projects | "Loft conversions and rear extensions for Victorian terraces in SW London" |
| **Preferred keywords** | Terms indicating a good fit | `extension, loft, dormer, conversion` |
| **Excluded keywords** | Terms that disqualify | `commercial, industrial, demolition` |
| **Preferred statuses** | Which application statuses | `pending, approved` |
| **Min project value** | Minimum estimated value | `50000` |

See [Outreach Guide](./outreach-guide.md) for detailed ICP configuration.

---

## Billing Settings

> **Location:** Settings → Billing
> **Plan Required:** All plans

Manage your subscription and payment details.

Operators: plan pricing, Stripe Price metadata, and AI meter setup are documented in [Stripe pricing & metadata](./stripe-pricing.md).

### Current Plan

Shows:
- Your plan name (Starter, Pro, Agency)
- Billing cycle (monthly)
- Next payment date
- **AI usage this month** — spend vs included allowance (and estimated additional charge when over, on your next invoice)

### Changing Plans

**Upgrading:**
1. Click **"Upgrade plan"**
2. Select new plan
3. Confirm payment
4. New features available immediately
5. Prorated charge applied

**Downgrading:**
1. Click **"Change plan"**
2. Select lower plan
3. Change takes effect at next billing cycle
4. Access to higher-tier features continues until then

### Payment Method

- Click **"Manage payment"** to open Stripe billing portal
- Update credit card
- View invoices
- Download receipts

### Cancellation

1. Click **"Cancel subscription"**
2. Access continues until end of current billing period
3. Data is retained for 30 days after cancellation
4. After 30 days, data is deleted

---

## Quick Reference: Feature Availability

### By Plan

| Feature | Starter | Pro | Agency |
|---------|---------|-----|--------|
| Map search | 25/day | Unlimited | Unlimited |
| Team seats | 1 | 3 | Unlimited |
| Letter creation | ✓ | ✓ | ✓ |
| PDF export | ✓ | ✓ | ✓ |
| CSV export | ✓ | ✓ | ✓ |
| Digital signature | — | ✓ | ✓ |
| Saved searches | — | ✓ | ✓ |
| Pinned application monitoring | — | ✓ | ✓ |
| Email digests | — | ✓ | ✓ |
| Bulk letter ZIP | — | — | ✓ |
| Priority support | — | — | ✓ |

### AI Features by Plan

| AI Feature | Starter | Pro | Agency |
|------------|---------|-----|--------|
| Natural language search | ✓ | ✓ | ✓ |
| Planning Q&A chat | ✓ | ✓ | ✓ |
| Digest summaries | ✓ | ✓ | ✓ |
| Compliance guardrail | ✓ | ✓ | ✓ |
| Letter assist | — | ✓ | ✓ |
| Applicant research | — | ✓ | ✓ |
| Smart enrichment | — | ✓ | ✓ |
| ICP classification | — | ✓ | ✓ |
| Autonomous outreach | — | — | ✓ |

---

## Related Guides

- [Getting Started](./getting-started.md) — Initial setup walkthrough
- [Letters Guide](./letters-guide.md) — Using templates and signatures
- [Outreach Guide](./outreach-guide.md) — ICP and autonomous pipeline
