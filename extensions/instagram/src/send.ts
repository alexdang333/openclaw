import type { OpenClawConfig } from "openclaw/plugin-sdk/instagram";
import { resolveInstagramAccount } from "./accounts.js";
import type { InstagramFetch, InstagramQuickReply } from "./api.js";
import { sendMessage } from "./api.js";
import { resolveInstagramProxyFetch } from "./proxy.js";
import { resolveInstagramToken } from "./token.js";

export type InstagramSendOptions = {
  token?: string;
  accountId?: string;
  cfg?: OpenClawConfig;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "file";
  caption?: string;
  quickReplies?: InstagramQuickReply[];
  verbose?: boolean;
  proxy?: string;
  apiVersion?: string;
};

export type InstagramSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

const INSTAGRAM_TEXT_LIMIT = 1000;

function resolveSendContext(options: InstagramSendOptions): {
  token: string;
  fetcher?: InstagramFetch;
  apiVersion?: string;
} {
  if (options.cfg) {
    const account = resolveInstagramAccount({
      cfg: options.cfg,
      accountId: options.accountId,
    });
    const token = options.token || account.token;
    const proxy = options.proxy ?? account.config.proxy;
    const apiVersion = options.apiVersion ?? account.config.apiVersion;
    return { token, fetcher: resolveInstagramProxyFetch(proxy), apiVersion };
  }

  const token = options.token ?? resolveInstagramToken(undefined, options.accountId).token;
  const proxy = options.proxy;
  return { token, fetcher: resolveInstagramProxyFetch(proxy), apiVersion: options.apiVersion };
}

function resolveValidatedSendContext(
  recipientId: string,
  options: InstagramSendOptions,
):
  | { ok: true; recipientId: string; token: string; fetcher?: InstagramFetch; apiVersion?: string }
  | { ok: false; error: string } {
  const { token, fetcher, apiVersion } = resolveSendContext(options);
  if (!token) {
    return { ok: false, error: "No Instagram page access token configured" };
  }
  const trimmedId = recipientId?.trim();
  if (!trimmedId) {
    return { ok: false, error: "No recipient ID provided" };
  }
  return { ok: true, recipientId: trimmedId, token, fetcher, apiVersion };
}

export async function sendMessageInstagram(
  recipientId: string,
  text: string,
  options: InstagramSendOptions = {},
): Promise<InstagramSendResult> {
  const context = resolveValidatedSendContext(recipientId, options);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (options.mediaUrl) {
    return sendMediaInstagram(context.recipientId, options.mediaUrl, {
      ...options,
      token: context.token,
      caption: text || options.caption,
    });
  }

  try {
    const response = await sendMessage(
      context.token,
      {
        recipient: { id: context.recipientId },
        messaging_type: "RESPONSE",
        message: {
          text: text.slice(0, INSTAGRAM_TEXT_LIMIT),
          quick_replies: options.quickReplies,
        },
      },
      context.fetcher,
      context.apiVersion,
    );

    if (response?.message_id) {
      return { ok: true, messageId: response.message_id };
    }

    return { ok: false, error: "Failed to send message" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendMediaInstagram(
  recipientId: string,
  mediaUrl: string,
  options: InstagramSendOptions = {},
): Promise<InstagramSendResult> {
  const context = resolveValidatedSendContext(recipientId, options);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (!mediaUrl?.trim()) {
    return { ok: false, error: "No media URL provided" };
  }

  const mediaType = options.mediaType ?? "image";

  try {
    const response = await sendMessage(
      context.token,
      {
        recipient: { id: context.recipientId },
        messaging_type: "RESPONSE",
        message: {
          attachment: {
            type: mediaType,
            payload: { url: mediaUrl.trim(), is_reusable: true },
          },
        },
      },
      context.fetcher,
      context.apiVersion,
    );

    if (!response?.message_id) {
      return { ok: false, error: "Failed to send media" };
    }

    const caption = options.caption?.trim();
    if (caption) {
      await sendMessage(
        context.token,
        {
          recipient: { id: context.recipientId },
          messaging_type: "RESPONSE",
          message: { text: caption.slice(0, INSTAGRAM_TEXT_LIMIT) },
        },
        context.fetcher,
        context.apiVersion,
      );
    }

    return { ok: true, messageId: response.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
