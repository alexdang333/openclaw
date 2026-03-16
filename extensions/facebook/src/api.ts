/**
 * Facebook Graph API client
 * @see https://developers.facebook.com/docs/graph-api
 * @see https://developers.facebook.com/docs/messenger-platform
 */

const DEFAULT_API_VERSION = "v21.0";
const GRAPH_API_BASE = "https://graph.facebook.com";

export type FacebookFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type FacebookApiError = {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export type FacebookApiResponse<T = unknown> = {
  data?: T;
  error?: FacebookApiError;
};

export type FacebookPageInfo = {
  id: string;
  name: string;
};

export type FacebookMessageRecipient = {
  id: string;
};

export type FacebookQuickReply = {
  content_type: "text" | "user_phone_number" | "user_email";
  title?: string;
  payload?: string;
  image_url?: string;
};

export type FacebookSendMessageParams = {
  recipient: FacebookMessageRecipient;
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
    quick_replies?: FacebookQuickReply[];
  };
};

export type FacebookSendResponse = {
  recipient_id: string;
  message_id: string;
};

export type FacebookSenderActionParams = {
  recipient: FacebookMessageRecipient;
  sender_action: "typing_on" | "typing_off" | "mark_seen";
};

/** Inbound webhook payload types */
export type FacebookWebhookEntry = {
  id: string;
  time: number;
  messaging: FacebookMessagingEvent[];
};

export type FacebookWebhookPayload = {
  object: "page";
  entry: FacebookWebhookEntry[];
};

export type FacebookMessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: FacebookInboundMessage;
  postback?: FacebookPostback;
  delivery?: FacebookDelivery;
  read?: FacebookRead;
};

export type FacebookInboundMessage = {
  mid: string;
  text?: string;
  attachments?: FacebookAttachment[];
  quick_reply?: { payload: string };
  reply_to?: { mid: string };
  is_echo?: boolean;
};

export type FacebookAttachment = {
  type: "image" | "audio" | "video" | "file" | "fallback" | "location";
  payload: {
    url?: string;
    coordinates?: { lat: number; long: number };
    sticker_id?: number;
  };
};

export type FacebookPostback = {
  mid: string;
  title: string;
  payload: string;
};

export type FacebookDelivery = {
  mids: string[];
  watermark: number;
};

export type FacebookRead = {
  watermark: number;
};

export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly type: string,
    public readonly errorSubcode?: number,
    public readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = "GraphApiError";
  }

  /** True if this is a rate limit error */
  get isRateLimit(): boolean {
    return this.code === 4 || this.code === 32 || this.code === 613;
  }

  /** True if this is an auth/token error */
  get isAuthError(): boolean {
    return this.code === 190;
  }
}

/**
 * Call the Facebook Graph API
 */
export async function callGraphApi<T = unknown>(
  path: string,
  token: string,
  options?: {
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
    timeoutMs?: number;
    fetch?: FacebookFetch;
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

    const data = (await response.json()) as T & { error?: FacebookApiError };

    if (data.error) {
      throw new GraphApiError(
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

/**
 * Get page info to validate token
 */
export async function getMe(
  token: string,
  timeoutMs?: number,
  fetcher?: FacebookFetch,
  apiVersion?: string,
): Promise<FacebookPageInfo> {
  return callGraphApi<FacebookPageInfo>("me?fields=id,name", token, {
    method: "GET",
    timeoutMs,
    fetch: fetcher,
    apiVersion,
  });
}

/**
 * Send a message via the Send API
 */
export async function sendMessage(
  token: string,
  params: FacebookSendMessageParams,
  fetcher?: FacebookFetch,
  apiVersion?: string,
): Promise<FacebookSendResponse> {
  return callGraphApi<FacebookSendResponse>("me/messages", token, {
    method: "POST",
    body: params as unknown as Record<string, unknown>,
    fetch: fetcher,
    apiVersion,
  });
}

/**
 * Send a sender action (typing indicator, mark seen)
 */
export async function sendSenderAction(
  token: string,
  params: FacebookSenderActionParams,
  fetcher?: FacebookFetch,
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
