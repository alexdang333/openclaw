import type { BaseProbeResult } from "openclaw/plugin-sdk/facebook";
import { getMe, GraphApiError, type FacebookFetch, type FacebookPageInfo } from "./api.js";

export type FacebookProbeResult = BaseProbeResult<string> & {
  page?: FacebookPageInfo;
  elapsedMs: number;
};

export async function probeFacebook(
  token: string,
  timeoutMs = 5000,
  fetcher?: FacebookFetch,
  apiVersion?: string,
): Promise<FacebookProbeResult> {
  if (!token?.trim()) {
    return { ok: false, error: "No token provided", elapsedMs: 0 };
  }

  const startTime = Date.now();

  try {
    const page = await getMe(token.trim(), timeoutMs, fetcher, apiVersion);
    const elapsedMs = Date.now() - startTime;

    if (page?.id) {
      return { ok: true, page, elapsedMs };
    }

    return { ok: false, error: "Invalid response from Graph API", elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;

    if (err instanceof GraphApiError) {
      return { ok: false, error: err.message, elapsedMs };
    }

    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return { ok: false, error: `Request timed out after ${timeoutMs}ms`, elapsedMs };
      }
      return { ok: false, error: err.message, elapsedMs };
    }

    return { ok: false, error: String(err), elapsedMs };
  }
}
