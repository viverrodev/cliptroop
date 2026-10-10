import "server-only";

import { WORDS } from "./words";

/* Server check of a guess (the board checks too, for an instant answer). */
let set: Set<string> | null = null;
/** Is this (lower-case, five letters) a word? */
export function isValidWord(w: string) {
  set ??= new Set(WORDS.split(" "));
  return set.has(w);
}
