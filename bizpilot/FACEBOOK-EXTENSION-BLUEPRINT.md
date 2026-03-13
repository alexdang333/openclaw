# Facebook Messenger Extension — Blueprint

> Based on deep analysis of `extensions/zalo/` pattern.
> Reference for building `extensions/facebook/`.

## Files to Create

### Root files

| File                   | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `package.json`         | npm metadata + `openclaw.channel` block + `openclaw.install` |
| `openclaw.plugin.json` | Plugin manifest with `channels: ["facebook"]`                |
| `index.ts`             | Entry: `setFacebookRuntime()`, `api.registerChannel()`       |

### Source files (`src/`)

| File                 | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `types.ts`           | `FacebookAccountConfig`, `ResolvedFacebookAccount`, token source type     |
| `config-schema.ts`   | Zod schema via `buildCatchallMultiAccountChannelSchema`                   |
| `api.ts`             | Graph API client: `callGraphApi()`, `sendMessage()`, `getMe()`            |
| `token.ts`           | `resolveFacebookToken()` — page access token from config/env/file         |
| `accounts.ts`        | `resolveFacebookAccount()`, `listFacebookAccountIds()`                    |
| `send.ts`            | `sendMessageFacebook()` — calls Graph API send                            |
| `probe.ts`           | `probeFacebook()` — calls `/me` on Graph API                              |
| `monitor.webhook.ts` | Webhook security: hub challenge + `x-hub-signature-256` HMAC, dedup       |
| `monitor.ts`         | `monitorFacebookProvider()` — webhook mode + `processUpdate()` pipeline   |
| `onboarding.ts`      | Wizard: page access token, webhook URL/verify token                       |
| `status-issues.ts`   | Config warnings                                                           |
| `actions.ts`         | Message actions (send)                                                    |
| `channel.ts`         | `facebookPlugin: ChannelPlugin<ResolvedFacebookAccount>` + `facebookDock` |
| `runtime.ts`         | Runtime store singleton                                                   |
| `group-access.ts`    | DM/group access control                                                   |
| `secret-input.ts`    | Re-export SDK helpers                                                     |
| `proxy.ts`           | Proxy fetch (optional)                                                    |

## Key Differences from Zalo

1. **Token**: Facebook uses OAuth page access tokens (long-lived), not bot tokens
2. **Webhook verification**: `hub.challenge` (GET) + `x-hub-signature-256` HMAC-SHA256 (POST), not secret header
3. **No polling mode**: Webhook-only (Facebook doesn't support long-polling for pages)
4. **Graph API**: Base URL `https://graph.facebook.com/v{version}/`, not bot-prefix scheme
5. **Send**: `POST /{page-id}/messages` with `recipient: { id }` body
6. **Payload format**: `{ object: "page", entry: [...] }` → iterate `entry[].messaging[]`
7. **Typing indicator**: `sender_action: "typing_on"` (nice UX touch)

## Message Processing Pipeline (from Zalo pattern)

```
processUpdate(update)
  → handleMessage(entry.messaging[])
    → processMessageWithPipeline()
        1. evaluateGroupAccess()              // group policy check
        2. resolveSenderCommandAuth()         // allowlist / pairing
        3. resolveDirectDmAuth()              // DM policy
        4. issuePairingChallenge()            // if pairing mode
        5. resolveInboundRouteEnvelope()      // session key + agent routing
        6. core.channel.reply.finalizeInboundContext()
        7. core.channel.session.recordInboundSession()
        8. core.channel.reply.dispatchReply()  // trigger AI
            → deliverFacebookReply()          // send text/photo back
```

## Security Considerations

- **Webhook signature validation**: MUST verify `x-hub-signature-256` HMAC-SHA256 using app secret
- **Token storage**: Page access tokens in env vars or SecretRef, never in code
- **Rate limiting**: Implement per-IP rate limiting on webhook endpoint
- **Replay protection**: Dedup cache (5-minute window by message ID)
- **HTTPS only**: Webhook URL must be HTTPS
- **Token scope**: Request minimum necessary Facebook permissions

## SDK Interface References

- `src/channels/plugins/types.plugin.ts` — `ChannelPlugin<T>` full interface
- `src/channels/plugins/types.adapters.ts` — all adapter sub-interfaces
- `src/plugins/types.ts` — `OpenClawPluginApi`, `OpenClawPluginDefinition`
- `src/plugins/runtime/types.ts` — `PluginRuntime` full type
- `src/plugins/runtime/types-channel.ts` — `PluginRuntimeChannel`
