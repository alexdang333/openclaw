import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { FacebookFetch } from "./api.js";

const proxyCache = new Map<string, FacebookFetch>();

export function resolveFacebookProxyFetch(proxyUrl?: string | null): FacebookFetch | undefined {
  const trimmed = proxyUrl?.trim();
  if (!trimmed) {
    return undefined;
  }
  const cached = proxyCache.get(trimmed);
  if (cached) {
    return cached;
  }
  const agent = new ProxyAgent(trimmed);
  const fetcher: FacebookFetch = (input, init) =>
    undiciFetch(input, {
      ...init,
      dispatcher: agent,
    } as UndiciRequestInit) as unknown as Promise<Response>;
  proxyCache.set(trimmed, fetcher);
  return fetcher;
}
