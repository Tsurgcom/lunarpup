import type { BodyState } from "./physics";

/** Module-level local pup body — rocks read this each frame for collisions. */

let body: BodyState | null = null;

export function setLocalBody(next: BodyState): void {
  body = next;
}

export function getLocalBody(): BodyState | null {
  return body;
}
