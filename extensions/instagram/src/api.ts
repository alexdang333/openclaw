/**
 * Instagram Graph API client (shares Messenger Platform with Facebook)
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
 * @see https://developers.facebook.com/docs/messenger-platform
 */

const DEFAULT_API_VERSION = "v21.0";
const GRAPH_API_BASE = "https://graph.facebook.com";

export type InstagramFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type GraphApiError = {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export type InstagramAccountInfo = {
  id: string;
  name: string;
  username?: string;
};

export type InstagramMessageRecipient = {
  id: string;
};

export type InstagramQuickReply = {
  content_type: "text";
  title?: string;
  payload?: string;
};

export type InstagramSendMessageParams = {
  recipient: InstagramMessageRecipient;
  messaging_type: "RESPONSE" | "UPDATE" | "MESSAGE_TAG";
  message: {
    text?: string;
    attachment?: {
      type: "image" | "audio" | "video" | "file";
      payload: {
        url: string;
        is_reusable?: boolean;
      };
    };
    quick_replies?: InstagramQuickReply[];
  };
};

export type InstagramSendResponse = {
  recipient_id: string;
  message_id: string;
};

export type InstagramSenderActionParams = {
  recipient: InstagramMessageRecipient;
  sender_action: "typing_on" | "typing_off" | "mark_seen";
};

/** Inbound webhook payload types */
export type InstagramWebhookEntry = {
  id: string;
  time: number;
  messaging: InstagramMessagingEvent[];
};

export type InstagramWebhookPayload = {
  object: "instagram";
  entry: InstagramWebhookEntry[];
};

export type InstagramMessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: InstagramInboundMessage;
  postback?: InstagramPostback;
};

export type InstagramInboundMessage = {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
  quick_reply?: { payload: string };
  is_echo?: boolean;
};

export type InstagramAttachment = {
  type: "image" | "audio" | "video" | "file" | "story_mention" | "story_reply";
  payload: {
    url?: string;
  };
};

export type InstagramPostback = {
  mid: string;
  title: string;
  payload: string;
};

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly type: string,
    public readonly errorSubcode?: number,
    public readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }

  get isRateLimit(): boolean {
    return this.code === 4 || this.code === 32 || this.code === 613;
  }

  get isAuthError(): boolean {
    return this.code === 190;
  }
}

export async function callGraphApi<T = unknown>(
  path: string,
  token: string,
  options?: {
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
    timeoutMs?: number;
    fetch?: InstagramFetch;
    apiVersion?: string;
  },
): Promise<T> {
  const method = options?.method ?? "POST";
  const apiVersion = options?.apiVersion ?? DEFAULT_API_VERSION;
  const url = `${GRAPH_API_BASE}/${apiVersion}/${path}`;
  const controller = new AbortController();
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  const fetcher = options?.fetch ?? fetch;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    let fetchBody: string | undefined;
    if (options?.body && method === "POST") {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(options.body);
    }

    const response = await fetcher(url, {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
    });

    const data = (await response.json()) as T & { error?: GraphApiError };

    if (data.error) {
      throw new InstagramApiError(
        data.error.message,
        data.error.code,
        data.error.type,
        data.error.error_subcode,
        data.error.fbtrace_id,
      );
    }

    return data;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getMe(
  token: string,
  timeoutMs?: number,
  fetcher?: InstagramFetch,
  apiVersion?: string,
): Promise<InstagramAccountInfo> {
  return callGraphApi<InstagramAccountInfo>("me?fields=id,name,username", token, {
    method: "GET",
    timeoutMs,
    fetch: fetcher,
    apiVersion,
  });
}

export async function sendMessage(
  token: string,
  params: InstagramSendMessageParams,
  fetcher?: InstagramFetch,
  apiVersion?: string,
): Promise<InstagramSendResponse> {
  return callGraphApi<InstagramSendResponse>("me/messages", token, {
    method: "POST",
    body: params as unknown as Record<string, unknown>,
    fetch: fetcher,
    apiVersion,
  });
}

export async function sendSenderAction(
  token: string,
  params: InstagramSenderActionParams,
  fetcher?: InstagramFetch,
  timeoutMs?: number,
  apiVersion?: string,
): Promise<unknown> {
  return callGraphApi("me/messages", token, {
    method: "POST",
    body: params as unknown as Record<string, unknown>,
    timeoutMs,
    fetch: fetcher,
    apiVersion,
  });
}
