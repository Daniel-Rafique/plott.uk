# Letters — User Guide

> **Plan Required:** All plans (some features require Pro+)
> **AI Letter Assist:** Pro, Agency (~£0.02 per assist)

Letters are the end product of your prospecting workflow. This guide covers creating, managing, printing, and tracking outreach letters.

---

## Overview

The Letters page (`/app/letters`) shows every letter your team has created:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Letters                                                            │
│  Every letter your team has drafted. Re-print, mark as sent, or    │
│  schedule a follow-up.                                              │
├─────────────────────────────────────────────────────────────────────┤
│  [Filter: All ▼]  [Search]                          [+ New letter]  │
├─────────────────────────────────────────────────────────────────────┤
│  Recipient        │ Reference   │ Status  │ Created   │ Actions    │
│  ─────────────────┼─────────────┼─────────┼───────────┼─────────── │
│  Mr John Smith    │ 24/1234/FUL │ Draft   │ 23 Apr    │ [PDF] [✓]  │
│  ABC Architects   │ 24/5678/HOU │ Sent    │ 22 Apr    │ [PDF]      │
│  Mrs Jane Doe     │ 24/9012/PRI │ Draft   │ 21 Apr    │ [PDF] [✓]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Creating a Letter

### Method 1: From an Application

1. Find an application in the Dashboard
2. Click the pin or list item to open details
3. Click **"Write letter"**
4. The letter composer opens with pre-filled context

### Method 2: From Scratch

1. Go to Letters (`/app/letters`)
2. Click **"+ New letter"**
3. Enter the recipient details manually
4. Write or paste your letter content

### Method 3: From Outreach Approvals (Agency)

1. Go to Outreach (`/app/outreach`)
2. Review an AI-generated draft
3. Click **"Approve & draft letter"**
4. The approved draft becomes a letter

---

## The Letter Composer

When creating or editing a letter, you'll see:

### Header Section

| Field | Description | Auto-filled? |
|-------|-------------|--------------|
| **Recipient name** | Who the letter is addressed to | ✓ If enriched |
| **Recipient address** | Postal address | ✓ If enriched |
| **Subject** | Letter subject/RE: line | ✓ From template |
| **Application ref** | Planning reference | ✓ From source |

### Body Section

The main letter content. You can:
- Type directly
- Use a template
- Get AI assistance (Pro+)

### Your Details (Auto-filled)

From your branding settings:
- Company logo
- Company name and address
- Contact details
- Letter footer

---

## Using Templates

> **Plan Required:** All plans

Templates save time when writing similar letters repeatedly.

### Applying a Template

1. In the composer, click **"Use template"**
2. Select from your saved templates
3. The template content fills the body
4. Edit as needed for this specific recipient

### Template Variables

Templates can include placeholders that auto-fill:

| Variable | Replaced With |
|----------|---------------|
| `{{recipient_name}}` | The recipient's name |
| `{{site_address}}` | The application site address |
| `{{reference}}` | Planning reference number |
| `{{company_name}}` | Your company name |
| `{{sender_name}}` | Your name |

### Managing Templates

Go to **Settings → Templates** to:
- Create new templates
- Edit existing templates
- Set a default template
- Delete unused templates

---

## AI Letter Assist

> **Plan Required:** Pro, Agency
> **Cost:** ~£0.02 per assist

Click **"AI assist"** in the composer to get help:

### What AI Can Do

| Action | Description |
|--------|-------------|
| **Draft from context** | Generate a letter based on the application details |
| **Improve tone** | Make the letter more professional/friendly |
| **Shorten** | Condense a long letter |
| **Expand** | Add more detail to a brief letter |
| **Fix grammar** | Correct spelling and grammar |
| **Add opt-out** | Insert PECR-compliant unsubscribe text |

### How to Use

1. Write a rough draft (or start with a template)
2. Click **"AI assist"**
3. Choose an action or type a custom instruction
4. Review the suggested changes
5. Accept or modify as needed

---

## Adding Your Signature

> **Plan Required:** Pro, Agency

Letters can include your digital signature.

### Setting Up Your Signature

1. Go to **Settings → Signature**
2. Either:
   - **Draw** your signature using the canvas
   - **Upload** a signature image (PNG with transparent background)
3. Set your **signatory title** (e.g., "Director", "Managing Partner")
4. Save

### Using Your Signature

When generating a PDF, your signature appears above your name in the sign-off section.

---

## Generating PDFs

### Standard PDF

1. Review your letter in the composer
2. Click **"Generate PDF"**
3. The PDF opens in a new tab
4. Print or save as needed

### What's in the PDF

- Your company logo (top)
- Date
- Recipient name and address
- Subject line
- Letter body
- Sign-off with your signature
- Your name and title
- Company footer

### PDF Quality

- **Paper size:** A4
- **Resolution:** Print-ready (300 DPI)
- **Format:** PDF/A (archival quality)

---

## Letter Statuses

| Status | Meaning | Actions Available |
|--------|---------|-------------------|
| **Draft** | Not yet sent | Edit, Generate PDF, Mark as Sent |
| **Sent** | Marked as posted | View PDF, Schedule Reminder |
| **Reminded** | Follow-up scheduled | View PDF, Cancel Reminder |

### Marking as Sent

After printing and posting:
1. Find the letter in the list
2. Click the **checkmark** icon
3. Optionally enter the date sent
4. Status changes to "Sent"

---

## Follow-Up Reminders

> **Plan Required:** All plans

Schedule a reminder to chase if you don't hear back.

### Setting a Reminder

1. Find a sent letter in the list
2. Click **"Schedule reminder"**
3. Choose a date (e.g., 2 weeks from now)
4. Add an optional note

### How Reminders Work

- You'll receive an **email** on the reminder date
- The letter shows a **badge** indicating pending reminders
- Reminders appear in your dashboard

### Managing Reminders

- **View** — See all reminders for a letter
- **Complete** — Mark as done (you followed up)
- **Cancel** — Remove the reminder

---

## Bulk Operations

### Bulk PDF Generation (Agency)

> **Plan Required:** Agency

Generate multiple letters at once:

1. In the Dashboard, select multiple applications (checkboxes)
2. Click **"Generate letters"**
3. Choose a template to apply
4. Click **"Generate all"**
5. Download a ZIP file containing individual PDFs

### Bulk Status Update

1. In the Letters list, select multiple letters
2. Click **"Mark as sent"**
3. All selected letters update to "Sent" status

---

## Best Practices

### 1. Keep Letters Concise

Aim for 150–220 words. Busy people don't read long letters.

### 2. Be Specific

Reference the actual site and planning reference to show you've done your research.

### 3. Include an Opt-Out

PECR requires a way for recipients to stop future contact:

> "If you'd prefer not to receive further correspondence, simply reply with 'unsubscribe' and we'll remove you from our mailing list."

### 4. Track Your Outreach

Use the "Mark as sent" feature to track what you've posted. This helps avoid duplicate mailings.

### 5. Schedule Follow-Ups

Set a 2–3 week reminder for sent letters. A polite follow-up often generates responses the first letter didn't.

---

## Letter Content Tips

### Opening

❌ "Dear Sir/Madam, I am writing to you regarding..."

✅ "Dear Mr Smith, I noticed your planning application for a rear extension at 42 High Street..."

### Body

❌ Generic company pitch

✅ Specific connection: "We recently completed a similar extension at [nearby address] and thought our experience might be relevant."

### Call to Action

❌ "Please get in touch if interested"

✅ "I'll be in the area next Tuesday — would a quick 10-minute site visit be helpful?"

### Closing

❌ "Yours faithfully" (too formal for B2B)

✅ "Best regards" or "Kind regards"

---

## Costs Summary

| Feature | Plan | Cost |
|---------|------|------|
| Manual letter creation | All | Free |
| PDF generation | All | Free |
| Templates | All | Free |
| Digital signature | Pro+ | Free (included) |
| AI Letter Assist | Pro+ | ~£0.02 per assist |
| Bulk PDF generation | Agency | Free (included) |

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Logo not appearing on PDF | Not uploaded | Settings → Branding → upload logo |
| Signature missing | Not configured | Settings → Signature → draw or upload |
| "Template not found" | Template deleted | Create a new template |
| PDF generation fails | Content too long | Reduce letter length |
| Recipient address empty | Enrichment failed | Manually enter the address |

---

## Related Guides

- [Dashboard Guide](./dashboard-guide.md) — Finding applications to write to
- [Outreach Guide](./outreach-guide.md) — Automated letter generation (Agency)
- [Settings Guide](./settings-guide.md) — Branding, templates, signature setup
