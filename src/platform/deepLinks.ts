import { isTauri } from "./detect";

export type DeepLinkTarget =
  | { kind: "party"; id: string }
  | { kind: "world"; id: string };

/**
 * Parse `lunarpup://party/<id>`, `lunarpup://world/<id>`,
 * or https URLs with `?party=` / `?world=` query params.
 */
export function parseDeepLink(raw: string): DeepLinkTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const hostOrPath = `${url.host}${url.pathname}`.replace(/^\/+|\/+$/g, "");
    const segments = hostOrPath.split("/").filter(Boolean);

    if (url.protocol === "lunarpup:") {
      const kind = segments[0];
      const id = segments[1]?.trim();
      if (kind === "party" && id) return { kind: "party", id };
      if (kind === "world" && id) return { kind: "world", id };
    }

    const party = url.searchParams.get("party")?.trim();
    if (party) return { kind: "party", id: party };
    const world =
      url.searchParams.get("world")?.trim() ??
      url.searchParams.get("room")?.trim();
    if (world) return { kind: "world", id: world };
  } catch {
    // Fallback for bare `lunarpup:party/id` without //
    const m = /^lunarpup:\/?\/?(party|world)\/([^/?#]+)/i.exec(trimmed);
    if (m?.[1] && m[2]) {
      return { kind: m[1].toLowerCase() as "party" | "world", id: m[2] };
    }
  }
  return null;
}

/** Invite link for the current runtime (scheme in Tauri, http URL in browser). */
export function partyInviteUrl(partyId: string): string {
  if (isTauri()) return `lunarpup://party/${encodeURIComponent(partyId)}`;
  if (typeof window === "undefined") {
    return `lunarpup://party/${encodeURIComponent(partyId)}`;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("party", partyId);
  url.searchParams.delete("room");
  return url.toString();
}

export async function getLaunchDeepLinks(): Promise<DeepLinkTarget[]> {
  if (!isTauri()) return [];
  try {
    const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
    const urls = await getCurrent();
    if (!urls?.length) return [];
    return urls
      .map(parseDeepLink)
      .filter((t): t is DeepLinkTarget => t !== null);
  } catch {
    return [];
  }
}

export async function listenDeepLinks(
  onTarget: (target: DeepLinkTarget) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
    return await onOpenUrl((urls) => {
      for (const url of urls) {
        const target = parseDeepLink(url);
        if (target) onTarget(target);
      }
    });
  } catch {
    return () => {};
  }
}
