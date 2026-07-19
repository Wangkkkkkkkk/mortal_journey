import type { WorldBookEntry } from "./types";

export function matchWorldBookEntries(
  input: string,
  entries: WorldBookEntry[],
): string | undefined {
  const matched: string[] = [];
  for (const entry of entries) {
    if (entry.constant || entry.keys.some((k) => input.includes(k))) {
      matched.push(entry.content);
    }
  }
  return matched.length > 0 ? matched.join("\n\n") : undefined;
}
