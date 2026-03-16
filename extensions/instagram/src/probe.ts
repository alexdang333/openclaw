import type { BaseProbeResult } from "openclaw/plugin-sdk/instagram";
import { getMe, InstagramApiError, type InstagramFetch, type InstagramAccountInfo } from "./api.js";

export type InstagramProbeResult = BaseProbeResult<string> & {
  account?: InstagramAccountInfo;
  elapsedMs: number;
};

export async function probeInstagram(
  token: string,
  timeoutMs = 5000,
  fetcher?: InstagramFetch,
  apiVersion?: string,
): Promise<InstagramProbeResult> {
  if (!token?.trim()) {
    return { ok: false, error: "No token provided", elapsedMs: 0 };
  }

  const startTime = Date.now();

  try {
    const account = await getMe(token.trim(), timeoutMs, fetcher, apiVersion);
    const elapsedMs = Date.now() - startTime;

    if (account?.id) {
      return { ok: true, account, elapsedMs };
    }

    return { ok: false, error: "Invalid response from Graph API", elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;

    if (err instanceof InstagramApiError) {
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
