"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
// The upload library itself is downloaded only when a report has files.
import type { Upload as TusUpload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm-provider";
import { DoneBurst } from "@/components/ui/done-burst";
import { Ago } from "@/components/ui/ago";
import { sounds } from "@/lib/sounds";
import { AlertIcon, BugIcon, CheckIcon, CloseIcon, ImageIcon, LightbulbIcon, PlayIcon, RetryIcon, UploadIcon } from "@/components/ui/icons";
import { UPLOAD_CHUNK_BYTES } from "@/modules/review/lib/limits";
import {
  FEEDBACK_BUCKET,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_MAX_CHARS,
  FEEDBACK_MAX_FILES,
  FEEDBACK_MIN_CHARS,
  feedbackFileProblem,
  mb,
  safeFileName,
  type FeedbackKind,
} from "@/lib/feedback";
import { submitFeedback } from "./feedback-actions";

type Item = { id: string; file: File; url: string; video: boolean; type: string; sent: number; state: "ready" | "uploading" | "uploaded" | "failed"; path?: string; broken?: boolean };
export type SentReport = { id: string; kind: FeedbackKind; message: string; status: "new" | "done"; createdAt: string; files: number };
type Phase = "edit" | "uploading" | "saving" | "sent" | "failed";

const EXT_TYPE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", avif: "image/avif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};
/** The file's media type (some phones leave it empty for HEIC / MOV). */
const mediaType = (f: File) => f.type || EXT_TYPE[(f.name.split(".").pop() ?? "").toLowerCase()] || "application/octet-stream";

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function uploadProblem(err: unknown, name: string) {
  const msg = String((err as Error)?.message ?? err ?? "");
  if (/413|too large|maximum|exceeded/i.test(msg)) return `${name} is bigger than 25 MB. Remove it or add a smaller one.`;
  if (/mime|content.?type|not supported|invalid_mime/i.test(msg)) return `${name} isn't a photo or video type storage accepts. Try a PNG, JPG or MP4.`;
  if (/401|403|row-level|policy|jwt|unauthor/i.test(msg)) return "Your session expired. Sign in again, then send it (your text is still here).";
  return `The upload of ${name} stopped. Check your connection and try again: nothing was lost.`;
}

/**
 * Settings → Account → Report: a bug or a suggestion, up to 500
 * characters and 3 photos / videos (25 MB each; drop, pick or paste a
 * screenshot). On Send: checks, uploads with progress (resumable, can be
 * cancelled), saves, and the All done tick. If anything fails it says what
 * and keeps everything for Try again. Only the developers get it.
 */
export function FeedbackForm({ userId, teamId, recent }: { userId: string; teamId: string | null; recent: SentReport[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const ids = useId();
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [phase, setPhase] = useState<Phase>("edit");
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<{ kind: FeedbackKind; files: number } | null>(null);
  const [burst, setBurst] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const kindRef = useRef<HTMLDivElement>(null);
  const upload = useRef<{ tus: TusUpload; reject: (e: Error) => void } | null>(null);
  const cancelled = useRef(false);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const busy = phase === "uploading" || phase === "saving";
  const text = message.trim();
  const dirty = !!kind || text.length > 0 || items.length > 0;
  const kindError = !kind ? "Pick Bug or Suggestion." : null;
  const textError =
    text.length === 0 ? (kind === "idea" ? "Write your idea." : "Write what happened.") : text.length < FEEDBACK_MIN_CHARS ? `Tell a bit more: at least ${FEEDBACK_MIN_CHARS} characters.` : null;

  // Leaving with an unsent report asks first.
  useEffect(() => {
    if (!dirty || phase === "sent") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, phase]);

  // Previews are freed when the form goes away.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  /** Takes files back out of storage (already uploaded on an attempt that failed). */
  const removeStored = (paths: string[]) => {
    if (paths.length) void createClient().storage.from(FEEDBACK_BUCKET).remove(paths).catch(() => {});
  };

  function addFiles(list: FileList | File[] | null | undefined) {
    if (!list || busy) return;
    const problems: string[] = [];
    const next: Item[] = [];
    for (const f of Array.from(list)) {
      if (items.length + next.length >= FEEDBACK_MAX_FILES) {
        problems.push(`Up to ${FEEDBACK_MAX_FILES} files: ${f.name} wasn't added.`);
        continue;
      }
      const p = feedbackFileProblem({ name: f.name, type: f.type, size: f.size });
      if (p) {
        problems.push(p);
        continue;
      }
      if ([...items, ...next].some((i) => i.file.name === f.name && i.file.size === f.size)) continue;
      const type = mediaType(f);
      next.push({ id: uid(), file: f, url: URL.createObjectURL(f), video: type.startsWith("video/"), type, sent: 0, state: "ready" });
    }
    setFileProblems(problems);
    if (next.length) {
      void import("tus-js-client").catch(() => {}); // ready by the time Send is pressed
      setItems((prev) => [...prev, ...next]);
      if (phase === "failed") setPhase("edit");
    }
  }

  function removeItem(it: Item) {
    URL.revokeObjectURL(it.url);
    if (it.path) removeStored([it.path]);
    setItems((list) => list.filter((i) => i.id !== it.id));
    setFileProblems([]);
  }

  function reset() {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    setKind(null);
    setMessage("");
    setFileProblems([]);
    setShowErrors(false);
    setFailure(null);
  }

  async function clear() {
    const ok = await confirm({ title: "Clear this report?", description: "Your text and files will be removed.", confirmLabel: "Clear", danger: true });
    if (!ok) return;
    removeStored(items.map((i) => i.path).filter((p): p is string => !!p));
    reset();
    setPhase("edit");
  }

  async function uploadOne(it: Item, token: string): Promise<string> {
    const { Upload } = await import("tus-js-client");
    if (cancelled.current) throw new Error("cancelled");
    const path = `${userId}/${uid()}-${safeFileName(it.file.name)}`;
    return new Promise((resolve, reject) => {
      const tus = new Upload(it.file, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 1500, 4000, 8000],
        headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: UPLOAD_CHUNK_BYTES,
        metadata: { bucketName: FEEDBACK_BUCKET, objectName: path, contentType: it.type, cacheControl: "3600" },
        onProgress: (bytes) => patch(it.id, { sent: bytes }),
        onError: (err) => reject(err),
        onSuccess: () => resolve(path),
      });
      upload.current = { tus, reject };
      tus.start();
    });
  }

  function fail(why: string) {
    setFailure(why);
    setPhase("failed");
  }

  async function send() {
    if (busy) return;
    setShowErrors(true);
    if (kindError) {
      kindRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    if (textError) {
      textRef.current?.focus();
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      fail("You're offline. Connect to the internet and press Try again: nothing was lost.");
      return;
    }
    setFailure(null);
    cancelled.current = false;

    const list = items;
    const paths = new Map<string, string>();
    if (list.some((i) => !i.path)) {
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) {
        fail("Your session expired. Sign in again, then send it (your text is still here).");
        return;
      }
      setPhase("uploading");
      for (const it of list) {
        if (it.path) {
          paths.set(it.id, it.path);
          continue;
        }
        patch(it.id, { state: "uploading", sent: 0 });
        try {
          const p = await uploadOne(it, session.access_token);
          patch(it.id, { state: "uploaded", path: p, sent: it.file.size });
          paths.set(it.id, p);
        } catch (e) {
          upload.current = null;
          if (cancelled.current) {
            patch(it.id, { state: "ready", sent: 0 });
            setPhase("edit");
            return;
          }
          patch(it.id, { state: "failed", sent: 0 });
          fail(uploadProblem(e, it.file.name));
          return;
        }
      }
      upload.current = null;
    } else {
      for (const it of list) paths.set(it.id, it.path!);
    }

    setPhase("saving");
    let r: { error?: string; id?: string };
    try {
      r = await submitFeedback({
        kind: kind!,
        message: text,
        files: list.map((it) => ({ path: paths.get(it.id)!, name: it.file.name, type: it.type, size: it.file.size })),
        teamId,
        context: {
          page: (() => {
            try {
              const ref = document.referrer ? new URL(document.referrer) : null;
              return ref && ref.origin === location.origin && !ref.pathname.startsWith("/settings") ? ref.pathname + ref.search : undefined;
            } catch {
              return undefined;
            }
          })(),
          ua: navigator.userAgent,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        },
      });
    } catch {
      r = { error: "It didn't go through. Check your connection and try again: nothing was lost." };
    }
    if (r.error) {
      fail(r.error);
      return;
    }
    sounds.celebrate();
    setSent({ kind: kind!, files: list.length });
    setBurst((b) => b + 1);
    reset();
    setPhase("sent");
    router.refresh();
  }

  function cancel() {
    cancelled.current = true;
    const u = upload.current;
    upload.current = null;
    if (u) {
      void u.tus.abort(true).catch(() => {});
      u.reject(new Error("cancelled"));
    }
  }

  const total = items.reduce((s, i) => s + i.file.size, 0);
  const done = items.reduce((s, i) => s + (i.state === "uploaded" ? i.file.size : i.sent), 0);
  const pct = phase === "saving" ? 100 : total ? Math.min(99, Math.round((done / total) * 100)) : 0;
  const uploadingIndex = items.findIndex((i) => i.state === "uploading");
  const sendLabel = phase === "failed" ? "Try again" : kind === "bug" ? "Send bug report" : kind === "idea" ? "Send suggestion" : "Send";

  return (
    <div className="space-y-5">
      {burst > 0 && <DoneBurst key={burst} title="Sent" subtitle={sent?.kind === "idea" ? "Thanks for the idea" : "Thanks for reporting it"} />}

      {phase === "sent" && sent ? (
        <div className="rounded-2xl border border-green/30 bg-green/[0.07] p-4 sm:p-5 flex items-start gap-3.5" role="status">
          <span className="w-9 h-9 rounded-full bg-green text-white grid place-items-center flex-shrink-0" aria-hidden>
            <CheckIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Sent. Thank you!</div>
            <p className="text-[13px] text-ink-soft mt-0.5">
              Your {sent.kind === "bug" ? "bug report" : "suggestion"}
              {sent.files ? ` and ${sent.files === 1 ? "its file" : `its ${sent.files} files`}` : ""} reached the developer. It shows as Done in the list below once it&rsquo;s dealt with.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("edit");
                setSent(null);
              }}
              className="mt-3 rounded-lg border border-line/20 px-3.5 h-9 text-[13px] font-semibold hover:border-line/40"
            >
              Send another
            </button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          onPaste={(e) => {
            if (e.clipboardData?.files?.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          className="space-y-4"
        >
          {/* 1. What it is */}
          <div>
            <div className="text-[12.5px] font-semibold mb-2" id={`${ids}-kind`}>
              What is it?
            </div>
            <div ref={kindRef} role="radiogroup" aria-labelledby={`${ids}-kind`} aria-describedby={showErrors && kindError ? `${ids}-kind-err` : undefined} className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: "bug", icon: BugIcon, title: "Bug", text: "Something's broken or wrong", on: "border-red/60 bg-red/[0.07] ring-1 ring-red/40", dot: "bg-red/12 text-red" },
                  { id: "idea", icon: LightbulbIcon, title: "Suggestion", text: "An idea to make it better", on: "border-violet/60 bg-violet/[0.07] ring-1 ring-violet/40", dot: "bg-violet/12 text-violet" },
                ] as const
              ).map((o) => {
                const on = kind === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => setKind(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        const other = o.id === "bug" ? "idea" : "bug";
                        setKind(other);
                        (e.currentTarget.parentElement?.querySelector(`[data-kind="${other}"]`) as HTMLButtonElement | null)?.focus();
                      }
                    }}
                    data-kind={o.id}
                    tabIndex={on || (!kind && o.id === "bug") ? 0 : -1}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-60 ${
                      on ? o.on : showErrors && kindError ? "border-red/40 hover:border-line/40" : "border-line/15 hover:border-line/35"
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${o.dot}`} aria-hidden>
                      <o.icon className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{o.title}</span>
                      <span className="block text-[12px] text-ink-soft leading-snug">{o.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {showErrors && kindError && (
              <p id={`${ids}-kind-err`} className="mt-1.5 text-[12.5px] font-semibold text-red">
                {kindError}
              </p>
            )}
          </div>

          {/* 2. The words */}
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <label htmlFor={`${ids}-text`} className="text-[12.5px] font-semibold">
                {kind === "idea" ? "Your idea" : kind === "bug" ? "What happened?" : "Details"}
              </label>
              <span
                id={`${ids}-count`}
                className={`text-[11.5px] tabular-nums ${message.length >= FEEDBACK_MAX_CHARS ? "text-red font-semibold" : message.length > FEEDBACK_MAX_CHARS - 50 ? "text-gold font-semibold" : "text-ink-faint"}`}
                aria-live={message.length > FEEDBACK_MAX_CHARS - 50 ? "polite" : "off"}
              >
                {message.length} / {FEEDBACK_MAX_CHARS}
              </span>
            </div>
            <textarea
              ref={textRef}
              id={`${ids}-text`}
              value={message}
              maxLength={FEEDBACK_MAX_CHARS}
              disabled={busy}
              onChange={(e) => {
                setMessage(e.target.value.slice(0, FEEDBACK_MAX_CHARS));
                if (phase === "failed") setPhase("edit");
              }}
              rows={5}
              aria-invalid={showErrors && !!textError}
              aria-describedby={`${ids}-count${showErrors && textError ? ` ${ids}-text-err` : ""}`}
              placeholder={
                kind === "idea"
                  ? "What would you like it to do? What would it help you with?"
                  : kind === "bug"
                    ? "What did you do, what happened, and what did you expect? Which page were you on?"
                    : "Pick Bug or Suggestion above, then tell us about it."
              }
              className={`w-full rounded-xl border bg-paper/60 px-3.5 py-3 text-[14px] leading-relaxed resize-y min-h-[7.5rem] outline-none focus:border-amber/60 focus:ring-2 focus:ring-amber/20 disabled:opacity-70 ${
                showErrors && textError ? "border-red/50" : "border-line/15"
              }`}
            />
            {showErrors && textError && (
              <p id={`${ids}-text-err`} className="mt-1.5 text-[12.5px] font-semibold text-red">
                {textError}
              </p>
            )}
          </div>

          {/* 3. Photos and videos */}
          <div>
            <div className="text-[12.5px] font-semibold mb-2">
              Photos or videos <span className="font-normal text-ink-faint">(optional)</span>
            </div>
            <div
              onDragOver={(e) => {
                if (busy || !e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`rounded-xl border border-dashed p-2.5 transition-colors ${dragging ? "border-amber bg-amber/[0.06]" : "border-line/20"}`}
            >
              <ul className="flex flex-wrap gap-2.5">
                {items.map((it) => {
                  const p = it.state === "uploaded" ? 100 : it.file.size ? Math.round((it.sent / it.file.size) * 100) : 0;
                  return (
                    <li key={it.id} className="relative w-[5.5rem]">
                      <div className="relative w-[5.5rem] h-[5.5rem] rounded-lg overflow-hidden bg-surface-2 ring-1 ring-line/10">
                        {it.broken ? (
                          <span className="absolute inset-0 grid place-items-center text-ink-faint">{it.video ? <PlayIcon className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}</span>
                        ) : it.video ? (
                          <video src={it.url} muted playsInline preload="metadata" className="w-full h-full object-cover" onError={() => patch(it.id, { broken: true })} />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.url} alt="" className="w-full h-full object-cover" onError={() => patch(it.id, { broken: true })} />
                        )}
                        {it.video && !it.broken && (
                          <span className="absolute left-1.5 bottom-1.5 w-5 h-5 rounded-full bg-black/55 text-white grid place-items-center" aria-hidden>
                            <PlayIcon className="w-3 h-3" />
                          </span>
                        )}
                        {it.state === "uploading" && (
                          <span className="absolute inset-0 bg-black/45 text-white grid place-items-center text-[12px] font-bold tabular-nums">
                            {p}%
                            <span className="absolute left-1.5 right-1.5 bottom-1.5 h-1 rounded-full bg-white/30 overflow-hidden">
                              <span className="block h-full bg-white transition-[width] duration-200" style={{ width: `${p}%` }} />
                            </span>
                          </span>
                        )}
                        {it.state === "uploaded" && (
                          <span className="absolute right-1.5 bottom-1.5 w-5 h-5 rounded-full bg-green text-white grid place-items-center" aria-label="Uploaded">
                            <CheckIcon className="w-3 h-3" />
                          </span>
                        )}
                        {it.state === "failed" && (
                          <span className="absolute inset-0 bg-red/25 grid place-items-center text-red" aria-label="Didn't upload">
                            <AlertIcon className="w-6 h-6" />
                          </span>
                        )}
                        {!busy && (
                          <button
                            type="button"
                            onClick={() => removeItem(it)}
                            aria-label={`Remove ${it.file.name}`}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/75"
                          >
                            <CloseIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-ink-soft truncate" title={it.file.name}>
                        {mb(it.file.size)}
                      </div>
                    </li>
                  );
                })}
                {items.length < FEEDBACK_MAX_FILES && (
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                      className="w-[5.5rem] h-[5.5rem] rounded-lg border border-line/20 bg-surface-2/40 text-ink-soft hover:text-ink hover:border-line/40 flex flex-col items-center justify-center gap-1 text-[11.5px] font-semibold disabled:opacity-50"
                    >
                      <UploadIcon className="w-5 h-5" />
                      Add
                    </button>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[11.5px] text-ink-faint">
                Up to {FEEDBACK_MAX_FILES}, 25 MB each. <span className="hidden sm:inline">Drop them here or paste a screenshot.</span>
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {fileProblems.length > 0 && (
              <ul role="alert" className="mt-1.5 space-y-0.5">
                {fileProblems.map((p) => (
                  <li key={p} className="text-[12.5px] font-semibold text-red">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Where it's at */}
          {busy && (
            <div role="status" aria-live="polite" className="rounded-xl border border-line/10 bg-surface-2/50 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="font-semibold">
                  {phase === "uploading" ? `Uploading ${items.length > 1 ? `${Math.max(1, uploadingIndex + 1)} of ${items.length}` : "your file"}…` : "Sending…"}
                </span>
                {phase === "uploading" && <span className="tabular-nums text-ink-soft">{pct}%</span>}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-line/10 overflow-hidden">
                <div className={`h-full rounded-full bg-amber transition-[width] duration-300 ${phase === "saving" ? "animate-pulse" : ""}`} style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            </div>
          )}
          {phase === "failed" && failure && (
            <div role="alert" className="rounded-xl border border-red/35 bg-red/[0.07] px-3.5 py-3 flex items-start gap-2.5">
              <AlertIcon className="w-5 h-5 text-red flex-shrink-0 mt-0.5" />
              <div className="text-[13px]">
                <b>It wasn&rsquo;t sent.</b> {failure}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            {dirty && !busy && (
              <button type="button" onClick={() => void clear()} className="rounded-lg px-3 h-10 text-[13px] font-semibold text-ink-soft hover:text-ink">
                Clear
              </button>
            )}
            <span className="flex-1" />
            {phase === "uploading" && (
              <button type="button" onClick={cancel} className="rounded-lg border border-line/20 px-3.5 h-10 text-[13px] font-semibold hover:border-line/40">
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber text-white px-4 h-10 text-[13.5px] font-bold inline-flex items-center gap-2 hover:brightness-105 disabled:opacity-70"
            >
              {busy ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  {phase === "failed" && <RetryIcon className="w-4 h-4" />}
                  {sendLabel}
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {recent.length > 0 && (
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-faint mb-1">What you sent</h3>
          <ul className="divide-y divide-line/10">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2.5">
                <span className={`mt-0.5 w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${r.kind === "bug" ? "bg-red/12 text-red" : "bg-violet/12 text-violet"}`} aria-hidden>
                  {r.kind === "bug" ? <BugIcon className="w-4 h-4" /> : <LightbulbIcon className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] line-clamp-2 break-words">{r.message}</span>
                  <span className="block text-[11.5px] text-ink-faint">
                    {FEEDBACK_KIND_LABEL[r.kind]} · <Ago iso={r.createdAt} />
                    {r.files ? ` · ${r.files} file${r.files === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
                {r.status === "done" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green/15 text-green px-2 h-6 text-[11.5px] font-bold whitespace-nowrap">
                    <CheckIcon className="w-3 h-3" />
                    Done
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-2 text-ink-soft px-2 h-6 inline-flex items-center text-[11.5px] font-semibold whitespace-nowrap">Received</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
