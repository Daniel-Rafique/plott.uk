# Getting Started — Quick Start Guide

Get from sign-up to your first letter in under 10 minutes.

---

## Plan Overview

| Plan | Price | Best For | Key Features |
|------|-------|----------|--------------|
| **Starter** | See Stripe / pricing page | Sole traders and small teams | Search limits per plan, 1 user, basic AI (included allowance set in Stripe) |
| **Pro** | See Stripe / pricing page | Growing contractors | Higher limits, 3 seats, letter assist, research |
| **Agency** | See Stripe / pricing page | Multi-office firms | Unlimited seats, autonomous outreach, priority support |

All plans are billed at Stripe Checkout when you subscribe. Promo codes can be entered at checkout when offered.

---

## Step 1: Sign Up (2 minutes)

1. Go to the homepage and click **"Get started"**
2. Enter your email and create a password
3. Check your inbox for a **6-digit verification code**
4. Enter the code to verify your email

---

## Step 2: Set Up Your Company (2 minutes)

After verification, you'll land on the onboarding wizard:

1. **Company name** — Your trading name (appears on letters)
2. **Company address** — Your business address (letter header)
3. **Phone & email** — Contact details for letter footer
4. **Logo** — Upload your company logo (PNG, SVG, or JPG)

*Tip: You can update these later in Settings → Branding.*

---

## Step 3: Choose Your Plan (1 minute)

Select a plan based on your needs:

| Need | Recommended Plan |
|------|------------------|
| Just exploring, solo user | Starter |
| Active lead generation, small team | Pro |
| Automated outreach at scale | Agency |

You'll be redirected to Stripe to enter payment details. You are billed when you subscribe — enter a promo code at checkout if you have one.

---

## Step 4: Explore the Dashboard (2 minutes)

You're now in the app at `/app/dashboard`. Here's what you see:

### The Map View

- **3D Photorealistic Map** — Navigate to any area in the UK
- **Planning pins** — Each pin is a planning application
- **Click a pin** — See application details in the sidebar

### Search Controls

- **Search box** — Type an address, postcode, or reference number
- **Filters** — Filter by status (Pending, Approved), type, date range
- **View toggle** — Switch between 2D and 3D views

### Try It Now

1. Navigate to an area you work in (use mouse drag or search)
2. Zoom in to see individual planning applications
3. Click any pin to see the application details

---

## Step 5: Create Your First Letter (3 minutes)

When you find an interesting application:

1. **Click the pin** to open the details panel
2. **Review the application** — description, status, applicant info
3. **Click "Write letter"** to open the letter composer
4. **Choose a template** or start from scratch
5. **Review and edit** the letter content
6. **Click "Generate PDF"** to create a print-ready letter

### What's in the Letter?

- Your company logo and address (from branding settings)
- Recipient name and address (from enrichment)
- Personalised body referencing the specific site
- Your digital signature (if configured)
- Professional footer with contact details

---

## Step 6: Configure Your Settings (Optional)

To get the most out of the platform, configure these settings:

### Essential Settings

| Setting | Location | Why It Matters |
|---------|----------|----------------|
| **Branding** | Settings → Branding | Your logo and details appear on every letter |
| **Signature** | Settings → Signature | Add a digital signature to letters |
| **Templates** | Settings → Templates | Create reusable letter templates |

### AI Settings (Starter+)

| Setting | Location | Why It Matters |
|---------|----------|----------------|
| **AI Enabled** | Settings → AI | Master switch for AI features |
| **Daily Budget** | Settings → AI | Control daily AI spend |
| **ICP Profile** | Settings → AI | Define your ideal customer for smart filtering |

---

## What's Next?

Now that you're set up, explore these features:

| Feature | Plan Required | Guide |
|---------|---------------|-------|
| **Map Search & Filters** | All plans | [Dashboard Guide](./dashboard-guide.md) |
| **Creating Letters** | All plans | [Letters Guide](./letters-guide.md) |
| **Saved Searches, Pinned Apps & Digests** | Pro+ | [Saved Searches Guide](./saved-searches-guide.md) |
| **Autonomous Outreach** | Agency | [Outreach Guide](./outreach-guide.md) |

---

## Feature Availability by Plan

### Core Features (All Plans)

| Feature | Starter | Pro | Agency |
|---------|---------|-----|--------|
| 3D Map search | ✓ | ✓ | ✓ |
| Application details | ✓ | ✓ | ✓ |
| Manual letter creation | ✓ | ✓ | ✓ |
| PDF export | ✓ | ✓ | ✓ |
| CSV export | ✓ | ✓ | ✓ |
| Pin application monitoring | — | ✓ | ✓ |

### Search Limits

| Limit | Starter | Pro | Agency |
|-------|---------|-----|--------|
| Searches per day | 25 | Unlimited | Unlimited |
| Team seats | 1 | 3 | Unlimited |

### AI Features

| Feature | Starter | Pro | Agency | Typical Cost |
|---------|---------|-----|--------|--------------|
| Natural language search | ✓ | ✓ | ✓ | ~£0.001 |
| Planning Q&A chat | ✓ | ✓ | ✓ | ~£0.01 |
| Weekly AI digest | ✓ | ✓ | ✓ | ~£0.005 |
| Compliance guardrail | ✓ | ✓ | ✓ | ~£0.002 |
| Letter assist | — | ✓ | ✓ | ~£0.02 |
| Applicant research | — | ✓ | ✓ | ~£0.03 |
| Smart enrichment | — | ✓ | ✓ | ~£0.02 |
| ICP classifier | — | ✓ | ✓ | ~£0.001 |
| Autonomous outreach | — | — | ✓ | ~£0.05/lead |

### AI Budget by Plan

Included AI allowance is configured per plan in **Stripe Price metadata** (`ai_monthly_budget_gbp`). The table below is illustrative; your account may use different numbers. Usage beyond the included amount is billed as overage (see [Stripe pricing & metadata](./stripe-pricing.md)).

| Plan | Example included AI (GBP/month) | Approx. Operations |
|------|--------------------------------|-------------------|
| Starter | £10 | High-volume NL search / Q&A within allowance |
| Pro | £25 | Letter assist, research, enrichment within allowance |
| Agency | £75 | Outreach and agents within allowance; overage beyond cap |

---

## Getting Help

- **In-app Q&A** — Click the AI chat panel to ask questions about any application
- **Support page** — Visit `/support` for FAQs and contact options
- **Email** — hello@plott.uk

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Esc` | Close modal / panel |
| `Enter` | Confirm action |
| `Cmd/Ctrl + K` | Open search |
