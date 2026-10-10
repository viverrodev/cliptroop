"use server";

import { getWordState, submitGuess, type GuessResult, type WordState } from "./lib/state";

/** The daily word's board (the widget asks for it when it shows). */
export async function loadWord(): Promise<WordState | null> {
  return getWordState();
}

/**
 * One guess: its colours come straight back (no page re-render on the way,
 * so the board can show them at once). Finishing the game adds today's
 * contribution; the dashboard reads it fresh the next time it opens.
 */
export async function guessWord(word: string): Promise<GuessResult> {
  return submitGuess(word);
}
