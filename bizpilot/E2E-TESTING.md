# BizPilot End-to-End Testing Guide

## Prerequisites

### 1. Supabase (already set up)

- Project running at `https://snzoeqapezoydidicvlp.supabase.co`
- Schema deployed, RLS verified
- Test tenant "Test Beauty Shop" with `agent_id: bizpilot-test`
- 5 test products seeded

### 2. Facebook App Setup

1. Go to https://developers.facebook.com/apps
2. Create app → Type: **Business** → Name: "BizPilot Dev"
3. Add products: **Messenger** + **Instagram**
4. Settings → Basic → Note **App ID** and **App Secret**
5. Generate a **Page Access Token** for your test Page
6. For Instagram: connect your Instagram Professional account

### 3. Webhook Setup (ngrok for local dev)

```bash
# Install ngrok
brew install ngrok

# Start tunnel (gateway runs on 18789)
ngrok http 18789

# Note the HTTPS URL (e.g. https://abc123.ngrok-free.app)
```

### 4. Facebook Webhook Configuration

1. Messenger → Settings → Webhooks
2. Callback URL: `https://<ngrok-url>/facebook-webhook`
3. Verify Token: whatever you set in config
4. Subscribe to: `messages`, `messaging_postbacks`
5. Select your Page

### 5. Instagram Webhook Configuration

1. Instagram → Settings → Webhooks
2. Callback URL: `https://<ngrok-url>/instagram-webhook`
3. Verify Token: whatever you set in config
4. Subscribe to: `messages`

---

## OpenClaw Agent Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "agents": [
    {
      "id": "bizpilot-test",
      "name": "BizPilot Test",
      "model": { "primary": "anthropic/claude-haiku-4-5-20251001" }
    }
  ],
  "channels": {
    "facebook": {
      "enabled": true,
      "pageAccessToken": "EAA...",
      "appSecret": "abc123...",
      "webhookVerifyToken": "my-verify-token",
      "webhookPath": "/facebook-webhook",
      "dmPolicy": "open"
    },
    "instagram": {
      "enabled": true,
      "pageAccessToken": "EAA...",
      "appSecret": "abc123...",
      "webhookVerifyToken": "my-verify-token",
      "webhookPath": "/instagram-webhook",
      "dmPolicy": "open"
    }
  },
  "plugins": {
    "bizpilot-tools": {
      "supabaseUrl": "https://snzoeqapezoydidicvlp.supabase.co",
      "supabaseKey": "<service-role-key>",
      "adminNotifyChannel": "telegram",
      "adminNotifyTarget": "<your-telegram-chat-id>"
    }
  }
}
```

---

## Test Scenarios

### A. BizPilot Tools (Supabase) — Test first, no Facebook needed

Run the smoke test:

```bash
cd /Users/thangdang/Documents/Projects/BizPilot
npx tsx bizpilot/test-tools-smoke.ts
```

Expected results:

- `product-search`: Returns products matching "serum" from test data
- `save-lead`: Creates a lead record, returns leadId
- `escalate`: Returns formatted alert text

### B. Facebook Messenger Channel

1. **Webhook verification**: Facebook sends GET to `/facebook-webhook` → should return `hub.challenge`
2. **Text message**: Send "Hi" from test user → agent replies
3. **Product inquiry**: Send "How much is Vitamin C Serum?" → agent uses product-search tool → replies with price
4. **Lead capture**: Share contact info → agent uses save-lead tool → confirms saved
5. **Escalation**: Say "I want to speak to a human" → agent uses escalate tool → politely informs customer

### C. Instagram DM Channel

1. **Webhook verification**: Instagram sends GET to `/instagram-webhook` → should return `hub.challenge`
2. **Text message**: Send DM from Instagram → agent replies (verify 1000 char limit)
3. **Product inquiry**: Same as Facebook but via Instagram DM
4. **Story reply**: Reply to a story → agent processes `story_reply` attachment

### D. Security Verification

1. **Invalid signature**: Send POST with wrong `x-hub-signature-256` → should get 403
2. **Rate limiting**: Rapid-fire requests → should get 429 after threshold
3. **Replay protection**: Resend same message ID within 5 min → should be deduplicated
4. **RLS**: Use anon key to query Supabase → should return empty arrays

---

## Troubleshooting

| Issue                     | Check                                                 |
| ------------------------- | ----------------------------------------------------- |
| Webhook not receiving     | ngrok running? Facebook app subscribed to page?       |
| 403 on webhook            | App secret correct? Check x-hub-signature-256         |
| hub.challenge fails       | Verify token matches config?                          |
| product-search returns [] | Test data seeded? agent_id matches tenant?            |
| Agent not responding      | Gateway running? Agent configured? Check logs         |
| Instagram webhook 400     | Verify payload has `object: "instagram"` (not "page") |
