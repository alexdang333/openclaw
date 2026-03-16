import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { InstagramFetch } from "./api.js";

const proxyCache = new Map<string, InstagramFetch>();

export function resolveInstagramProxyFetch(proxyUrl?: string | null): InstagramFetch | undefined {
  const trimmed = proxyUrl?.trim();
  if (!trimmed) {
    return undefined;
  }
  const cached = proxyCache.get(trimmed);
  if (cached) {
    return cached;
  }
  const agent = new ProxyAgent(trimmed);
  const fetcher: InstagramFetch = (input, init) =>
    undiciFetch(input, {
      ...init,
      dispatcher: agent,
    } as UndiciRequestInit) as unknown as Promise<Response>;
  proxyCache.set(trimmed, fetcher);
  return fetcher;
}
