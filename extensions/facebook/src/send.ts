import type { OpenClawConfig } from "openclaw/plugin-sdk/facebook";
import { resolveFacebookAccount } from "./accounts.js";
import type { FacebookFetch, FacebookQuickReply } from "./api.js";
import { sendMessage } from "./api.js";
import { resolveFacebookProxyFetch } from "./proxy.js";
import { resolveFacebookToken } from "./token.js";

export type FacebookSendOptions = {
  token?: string;
  accountId?: string;
  cfg?: OpenClawConfig;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "file";
  caption?: string;
  quickReplies?: FacebookQuickReply[];
  verbose?: boolean;
  proxy?: string;
  apiVersion?: string;
};

export type FacebookSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

const FACEBOOK_TEXT_LIMIT = 2000;

function resolveSendContext(options: FacebookSendOptions): {
  token: string;
  fetcher?: FacebookFetch;
  apiVersion?: string;
} {
  if (options.cfg) {
    const account = resolveFacebookAccount({
      cfg: options.cfg,
      accountId: options.accountId,
    });
    const token = options.token || account.token;
    const proxy = options.proxy ?? account.config.proxy;
    const apiVersion = options.apiVersion ?? account.config.apiVersion;
    return { token, fetcher: resolveFacebookProxyFetch(proxy), apiVersion };
  }

  const token = options.token ?? resolveFacebookToken(undefined, options.accountId).token;
  const proxy = options.proxy;
  return { token, fetcher: resolveFacebookProxyFetch(proxy), apiVersion: options.apiVersion };
}

function resolveValidatedSendContext(
  recipientId: string,
  options: FacebookSendOptions,
):
  | { ok: true; recipientId: string; token: string; fetcher?: FacebookFetch; apiVersion?: string }
  | { ok: false; error: string } {
  const { token, fetcher, apiVersion } = resolveSendContext(options);
  if (!token) {
    return { ok: false, error: "No Facebook page access token configured" };
  }
  const trimmedId = recipientId?.trim();
  if (!trimmedId) {
    return { ok: false, error: "No recipient ID provided" };
  }
  return { ok: true, recipientId: trimmedId, token, fetcher, apiVersion };
}

export async function sendMessageFacebook(
  recipientId: string,
  text: string,
  options: FacebookSendOptions = {},
): Promise<FacebookSendResult> {
  const context = resolveValidatedSendContext(recipientId, options);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  // If media URL provided, send as attachment
  if (options.mediaUrl) {
    return sendMediaFacebook(context.recipientId, options.mediaUrl, {
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
          text: text.slice(0, FACEBOOK_TEXT_LIMIT),
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

export async function sendMediaFacebook(
  recipientId: string,
  mediaUrl: string,
  options: FacebookSendOptions = {},
): Promise<FacebookSendResult> {
  const context = resolveValidatedSendContext(recipientId, options);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (!mediaUrl?.trim()) {
    return { ok: false, error: "No media URL provided" };
  }

  const mediaType = options.mediaType ?? "image";

  try {
    // Send media attachment
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

    // If there's a caption, send it as a follow-up text message
    const caption = options.caption?.trim();
    if (caption) {
      await sendMessage(
        context.token,
        {
          recipient: { id: context.recipientId },
          messaging_type: "RESPONSE",
          message: { text: caption.slice(0, FACEBOOK_TEXT_LIMIT) },
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
