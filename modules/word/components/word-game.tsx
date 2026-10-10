"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { guessWord } from "../actions";
import type { GuessResult, WordMate, WordRow, WordState } from "../lib/state";
import { letterMarks, MAX_TRIES, shareGrid, WORD_LENGTH, type Mark } from "@/lib/word/score";
import { Mascot } from "@/components/ui/mascot";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { motionReduced } from "@/components/ui/count-up";
import { sounds } from "@/lib/sounds";
import { APP_NAME } from "@/lib/brand";

const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const FLIP_STEP = 250; // ms between tiles turning over
const HALF = 250; // a tile turns edge-on in this long, then back with its colour
const PRAISE = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"];
const TILE: Record<Mark, string> = { correct: "word-correct", present: "word-present", absent: "word-absent" };
const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-1px)", offset: 0.1 },
  { transform: "translateX(3px)", offset: 0.2 },
  { transform: "translateX(-6px)", offset: 0.3 },
  { transform: "translateX(6px)", offset: 0.4 },
  { transform: "translateX(-6px)", offset: 0.5 },
  { transform: "translateX(6px)", offset: 0.6 },
  { transform: "translateX(-6px)", offset: 0.7 },
  { transform: "translateX(3px)", offset: 0.8 },
  { transform: "translateX(-1px)", offset: 0.9 },
  { transform: "translateX(0)" },
];

/**
 * The daily word: six tries at today's five-letter word, typed on the
 * keyboard below (or your own). It answers like Wordle: a word that isn't
 * one (or was tried) shakes at once, checked on this device; a real one
 * starts turning over the moment you press Enter, while the server checks
 * it against today's word (which the browser never knows), and each tile
 * shows its colour as it turns: green = right letter, right spot; gold =
 * in the word, elsewhere; grey = not in it. Finishing (solved or not) is
 * today's contribution.
 */
export function WordGame({ initial }: { initial: WordState }) {
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [current, setCurrent] = useState("");
  /** The word being checked (it sits on the next row, turning over). */
  const [pending, setPending] = useState<string | null>(null);
  /** The row showing its colours tile by tile, and how many show so far. */
  const [reveal, setReveal] = useState<{ row: number; shown: number } | null>(null);
  const [hop, setHop] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const words = useRef<Set<string> | null>(null);
  const rowEls = useRef<(HTMLDivElement | null)[]>([]);
  const tileEls = useRef<(HTMLDivElement | null)[][]>(Array.from({ length: MAX_TRIES }, () => []));

  const playing = state.status === "playing";
  const busy = pending !== null || reveal !== null;
  // The keyboard only learns a row's colours once its tiles have turned.
  const known = useMemo(() => letterMarks(state.rows.filter((_, i) => i !== reveal?.row)), [state.rows, reveal?.row]);
  const say = useCallback((text: string, ms = 1800) => {
    setMsg(text);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), ms);
  }, []);

  // The word list, on its own after the page is up: a non-word is refused at once.
  useEffect(() => {
    let alive = true;
    import("@/lib/word/words")
      .then((m) => {
        if (alive) words.current = new Set(m.WORDS.split(" "));
      })
      .catch(() => {
        /* the server checks every guess anyway */
      });
    return () => {
      alive = false;
    };
  }, []);

  const shake = useCallback((row: number) => {
    const el = rowEls.current[row];
    if (el && !motionReduced()) el.animate(SHAKE, { duration: 450, easing: "ease-in-out" });
  }, []);

  /** After the server answered: each tile takes its colour while edge-on, then turns back. */
  const land = useCallback(
    async (row: number, word: string, flips: Animation[], r: GuessResult) => {
      if ("error" in r) {
        // Back to typing: the tiles turn back, the word stays to fix.
        for (const a of flips) {
          a.reverse();
          void a.finished.then(() => a.cancel(), () => undefined);
        }
        setPending(null);
        setCurrent(word);
        shake(row);
        say(r.error, 2400);
        if (r.reason === "busy" || r.reason === "session" || r.reason === "setup") sounds.error();
        return;
      }
      flushSync(() => {
        setState((s) => ({ ...s, rows: [...s.rows, r.row], status: r.status, answer: r.answer ?? s.answer, stats: r.stats ?? s.stats, team: r.team ?? s.team }));
        setPending(null);
        setReveal({ row, shown: 0 });
      });
      for (let i = 0; i < WORD_LENGTH; i++) {
        const flip = flips[i];
        if (flip) await flip.finished.catch(() => undefined);
        flushSync(() => setReveal({ row, shown: i + 1 }));
        const el = tileEls.current[row][i];
        if (flip && el) {
          const back = el.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: HALF, easing: "ease-out", fill: "forwards" });
          void back.finished.then(
            () => {
              flip.cancel();
              back.cancel();
            },
            () => undefined
          );
        }
      }
      if (flips.length) await new Promise((res) => setTimeout(res, HALF));
      setReveal(null);
      if (r.status === "won") {
        setHop(true);
        sounds.celebrate();
        say(PRAISE[Math.min(PRAISE.length - 1, row)], 2600);
      } else if (r.status === "lost") {
        sounds.pop();
        say(`The word was ${r.answer?.toUpperCase()}`, 4000);
      } else sounds.tick();
    },
    [say, shake]
  );

  const submit = useCallback(() => {
    if (busy || !playing) return;
    const row = state.rows.length;
    const word = current;
    if (word.length < WORD_LENGTH) {
      shake(row);
      say("Five letters, please.");
      return;
    }
    if (words.current && !words.current.has(word)) {
      shake(row);
      say("Not in the word list.");
      return;
    }
    if (state.rows.some((x) => x.word === word)) {
      shake(row);
      say("You tried that one already.");
      return;
    }
    // The tiles start turning over now; their colours land when the server answers.
    const tiles = tileEls.current[row].slice(0, WORD_LENGTH);
    const flips =
      motionReduced() || tiles.length < WORD_LENGTH || tiles.some((el) => !el)
        ? []
        : tiles.map((el, i) => el!.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(90deg)" }], { duration: HALF, delay: i * FLIP_STEP, easing: "ease-in", fill: "forwards" }));
    setPending(word);
    setCurrent("");
    guessWord(word).then(
      (r) => land(row, word, flips, r),
      () => land(row, word, flips, { error: "Couldn't check that. Try again.", reason: "busy" })
    );
  }, [busy, playing, state.rows, current, shake, say, land]);

  const press = useCallback(
    (key: string) => {
      if (!playing || busy) return;
      if (key === "enter") return submit();
      if (key === "back") return setCurrent((c) => c.slice(0, -1));
      if (/^[a-z]$/.test(key)) setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c));
    },
    [playing, busy, submit]
  );

  // Your own keyboard too (not while typing somewhere else, or with Ctrl / ⌘).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || help) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable='true']") || (t.tagName === "BUTTON" && e.key === "Enter" && !t.dataset.wordKey))) return;
      const k = e.key.toLowerCase();
      if (k === "enter") {
        e.preventDefault();
        press("enter");
      } else if (k === "backspace") press("back");
      else if (/^[a-z]$/.test(k)) press(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, help]);
  useEffect(() => () => void (msgTimer.current && clearTimeout(msgTimer.current)), []);

  async function share() {
    const text = `${APP_NAME} daily word #${state.number} ${state.status === "won" ? state.rows.length : "X"}/${MAX_TRIES}\n\n${shareGrid(state.rows)}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied: paste it anywhere (no letters, no spoilers)");
    } catch {
      toast.error("Couldn't copy it here.");
    }
  }

  const dayLabel = new Date(`${state.day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const winRate = state.stats.played ? Math.round((state.stats.won / state.stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...state.stats.dist);

  return (
    <div className="w-full max-w-[34rem] mx-auto flex flex-col items-center">
      <header className="w-full flex items-start gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[30px] leading-tight font-semibold">Daily word</h1>
          <p className="text-[13px] text-ink-soft">
            #{state.number} · {dayLabel}. Start your day with it: finishing it counts as today&rsquo;s contribution.
          </p>
        </div>
        <button type="button" onClick={() => setHelp(true)} className="flex-shrink-0 rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/40">
          How to play
        </button>
      </header>

      {!state.ready && <p className="w-full mb-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-[13px]">The daily word needs the latest database update (migration 0077). You can look, but guesses won&rsquo;t save yet.</p>}

      {/* The board: six rows of five. */}
      <div className="grid gap-[6px] w-full max-w-[19.5rem] [perspective:600px]" role="grid" aria-label={`Daily word #${state.number}, ${state.rows.length} of ${MAX_TRIES} tries used`}>
        {Array.from({ length: MAX_TRIES }, (_, r) => {
          const row: WordRow | null = state.rows[r] ?? null;
          const checking = !row && pending !== null && r === state.rows.length;
          const typing = !row && !checking && playing && r === state.rows.length;
          const letters = row ? row.word : checking ? pending : typing ? current : "";
          const won = state.status === "won" && r === state.rows.length - 1 && hop;
          return (
            // Same key while a row is typed, checked and revealed: its tiles keep turning over.
            <div key={`r${r}`} ref={(el) => void (rowEls.current[r] = el)} role="row" className="grid grid-cols-5 gap-[6px]">
              {Array.from({ length: WORD_LENGTH }, (_, i) => {
                const ch = letters[i] ?? "";
                const mark = row?.marks[i];
                const shown = mark && (!reveal || reveal.row !== r || i < reveal.shown);
                return (
                  <div
                    key={`${i}-${ch}`}
                    ref={(el) => void (tileEls.current[r][i] = el)}
                    role="gridcell"
                    aria-label={ch ? `${ch.toUpperCase()}${shown ? `, ${mark === "correct" ? "right spot" : mark === "present" ? "in the word, other spot" : "not in the word"}` : ""}` : "empty"}
                    className={`aspect-square flex items-center justify-center rounded-lg border-2 font-display text-[clamp(22px,7vw,30px)] font-semibold uppercase select-none ${
                      shown ? TILE[mark!] : ch ? "border-ink/45 bg-surface text-ink word-pop" : "border-line/20 bg-surface"
                    } ${won ? "word-hop" : ""}`}
                    style={won ? { animationDelay: `${i * 90}ms` } : undefined}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className={`h-9 mt-3 flex items-center text-[13.5px] font-semibold transition-opacity ${msg ? "opacity-100" : "opacity-0"}`} aria-live="polite">
        {msg && <span className="rounded-lg bg-ink text-paper px-3 py-1.5">{msg}</span>}
      </p>

      {playing || reveal ? (
        <div className="w-full max-w-[30rem] select-none" aria-label="Keyboard">
          {KEYS.map((row, ri) => (
            <div key={row} className="flex justify-center gap-[5px] mb-[6px]">
              {ri === 2 && <Key label="Enter" wide onPress={() => press("enter")} disabled={busy} />}
              {row.split("").map((k) => (
                <Key key={k} label={k} mark={known[k]} onPress={() => press(k)} />
              ))}
              {ri === 2 && (
                <Key
                  label="⌫"
                  aria="Delete a letter"
                  wide
                  onPress={() => press("back")}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <Result state={state} winRate={winRate} maxDist={maxDist} onShare={share} hidden={false} />
      )}

      <Dialog open={help} onClose={() => setHelp(false)} title="How to play" description="Guess the word in six tries.">
        <div className="space-y-3 text-[13.5px]">
          <p>Each guess is a real five-letter word. Press Enter to check it. Then the tiles show how close you were:</p>
          <Example word="crane" marks={["correct", "absent", "absent", "absent", "absent"]} text="C is in the word, in this spot." />
          <Example word="pilot" marks={["absent", "present", "absent", "absent", "absent"]} text="I is in the word, in another spot." />
          <Example word="vague" marks={["absent", "absent", "absent", "absent", "absent"]} text="None of these letters is in the word." />
          <p className="text-ink-soft">A new word every day, the same for everyone on {APP_NAME}. Solved or not, finishing it adds a square to your contributions. Your team sees how many tries you took, never your letters.</p>
        </div>
      </Dialog>
    </div>
  );
}

function Key({ label, mark, wide = false, aria, onPress, disabled = false }: { label: string; mark?: Mark; wide?: boolean; aria?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-word-key="1"
      aria-label={aria ?? (label.length === 1 ? `${label.toUpperCase()}${mark ? `, ${mark === "correct" ? "right spot" : mark === "present" ? "in the word" : "not in the word"}` : ""}` : label)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      disabled={disabled}
      className={`h-[54px] rounded-lg font-semibold uppercase transition-[filter,transform] active:scale-95 disabled:opacity-60 ${wide ? "px-2.5 min-w-[3.6rem] text-[12px]" : "flex-1 max-w-[2.6rem] text-[15px]"} ${
        mark ? TILE[mark] : "bg-surface-2 border border-line/15 text-ink hover:brightness-95"
      }`}
    >
      {label}
    </button>
  );
}

function Example({ word, marks, text }: { word: string; marks: Mark[]; text: string }) {
  return (
    <div>
      <div className="flex gap-1">
        {word.split("").map((ch, i) => (
          <span key={i} className={`w-9 h-9 rounded-md border-2 flex items-center justify-center font-display font-semibold uppercase ${marks[i] === "absent" && marks.some((m) => m !== "absent") ? "border-line/20" : TILE[marks[i]]}`}>
            {ch}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[12.5px] text-ink-soft">{text}</p>
    </div>
  );
}

function Result({ state, winRate, maxDist, onShare, hidden }: { state: WordState; winRate: number; maxDist: number; onShare: () => void; hidden: boolean }) {
  const won = state.status === "won";
  const tries = state.rows.length;
  return (
    <section className={`w-full mt-1 rounded-2xl border border-line/10 bg-surface p-5 transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100 animate-[fadein_.4s_ease]"}`} aria-live="polite">
      <div className="flex items-center gap-4">
        <Mascot mood={won ? "celebrate" : "idle"} size={84} className="flex-shrink-0 -my-2" />
        <div className="min-w-0">
          <p className="font-display text-[22px] leading-tight font-semibold">{won ? `Solved in ${tries}!` : "So close."}</p>
          <p className="text-[13px] text-ink-soft">
            {won ? "See you tomorrow for the next one." : (
              <>
                The word was <b className="text-ink uppercase tracking-wide">{state.answer}</b>.
              </>
            )}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green/12 text-green px-2.5 h-6 text-[12px] font-bold">
            <CheckIcon className="w-3 h-3" />
            Today&rsquo;s contribution
          </span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["Played", state.stats.played],
            ["Win %", winRate],
            ["Streak", state.stats.streak],
            ["Best", state.stats.best],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dd className="font-display text-[26px] leading-none font-semibold tabular-nums">{v}</dd>
            <dt className="mt-1 text-[11.5px] text-ink-soft">{k}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <div className="text-[12px] font-semibold text-ink-soft mb-2">Solved in</div>
        <ul className="space-y-1">
          {state.stats.dist.map((n, i) => {
            const today = won && i === tries - 1;
            return (
              <li key={i} className="flex items-center gap-2 text-[12px]">
                <span className="w-3 text-right tabular-nums text-ink-soft">{i + 1}</span>
                <span className="flex-1">
                  <span
                    className={`block h-5 rounded-[4px] px-1.5 text-right text-[11.5px] font-bold leading-5 tabular-nums ${today ? "word-correct" : "bg-surface-2 text-ink-soft"}`}
                    style={{ width: `${Math.max(8, (n / maxDist) * 100)}%` }}
                  >
                    {n}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {state.team.length > 1 && <TeamToday team={state.team} />}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] hover:brightness-110">
          <CopyIcon className="w-4 h-4" />
          Copy my squares
        </button>
        <Link href="/dashboard" className="inline-flex items-center rounded-lg border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:border-line/40">
          Back to the dashboard
        </Link>
      </div>
    </section>
  );
}

function TeamToday({ team }: { team: WordMate[] }) {
  const done = team.filter((m) => m.finished).length;
  return (
    <div className="mt-5">
      <div className="text-[12px] font-semibold text-ink-soft mb-2">
        Your team today <span className="text-ink-faint font-normal">· {done} of {team.length} finished</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {team.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 min-w-0 text-[13px]">
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: m.color }} aria-hidden>
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="flex-1 min-w-0 truncate">{m.me ? "You" : m.name}</span>
            <span className={`tabular-nums text-[12.5px] font-semibold ${m.finished ? (m.solved ? "text-green" : "text-red") : "text-ink-faint"}`}>
              {m.finished ? (m.solved ? `${m.tries}/${MAX_TRIES}` : `X/${MAX_TRIES}`) : m.tries ? "playing" : "not yet"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
