"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// The upload library itself is downloaded with the first upload, not with the page.
import type { Upload as TusUpload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { registerVersion } from "@/app/(dashboard)/shorts/[id]/review/actions";
import { useToast } from "@/components/ui/toast-provider";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, UPLOAD_CHUNK_BYTES, VIDEO_TYPES, formatBytes } from "../lib/limits";

/** Length and size of a local video file, read by the browser. */
function readMeta(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: { duration: number | null; width: number | null; height: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () =>
      done({
        duration: Number.isFinite(v.duration) ? v.duration : null,
        width: v.videoWidth || null,
        height: v.videoHeight || null,
      });
    v.onerror = () => done({ duration: null, width: null, height: null });
    setTimeout(() => done({ duration: null, width: null, height: null }), 8000);
    v.src = url;
  });
}

/**
 * "Upload new version". Sends the file straight to private storage in
 * 6 MB chunks (resumable: retries on its own if the connection drops),
 * then registers it as the next version.
 */
export function VersionUploader({
  teamId,
  shortId,
  nextNumber,
  onUploaded,
  prominent = false,
}: {
  teamId: string;
  shortId: string;
  nextNumber: number;
  onUploaded?: (versionId: string) => void;
  prominent?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<TusUpload | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // After saving, stay in "Updating…" until the page has really refreshed,
  // so the old "no video" state never flashes back.
  const [refreshing, startRefresh] = useTransition();
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (finished && !refreshing) {
      setFinished(false);
      setProgress(null);
    }
  }, [finished, refreshing]);

  async function start(file: File) {
    if (!VIDEO_TYPES.includes(file.type)) {
      toast.error("Upload an MP4, MOV or WebM video.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`That file is ${formatBytes(file.size)}. Videos can be up to ${MAX_VIDEO_MB} MB.`);
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Your session expired. Sign in again.");
      return;
    }

    let meta: Awaited<ReturnType<typeof readMeta>>;
    let Upload: typeof TusUpload;
    try {
      // The file's details and the upload library, together.
      [meta, { Upload }] = await Promise.all([readMeta(file), import("tus-js-client")]);
    } catch {
      toast.error("The uploader didn't load. Check your connection and try again.");
      return;
    }
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
    const path = `${teamId}/${shortId}/${crypto.randomUUID()}.${ext}`;
    setProgress({ sent: 0, total: file.size, name: file.name });

    const upload = new Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      headers: { authorization: `Bearer ${session.access_token}`, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: UPLOAD_CHUNK_BYTES,
      metadata: {
        bucketName: "review-videos",
        objectName: path,
        contentType: file.type,
        // Every upload is a new file name, so browsers may cache it for good.
        cacheControl: "31536000",
      },
      onProgress: (sent, total) => setProgress({ sent, total, name: file.name }),
      onError: (err) => {
        uploadRef.current = null;
        setProgress(null);
        const msg = String((err as Error)?.message ?? "");
        toast.error(
          /413|too large|maximum/i.test(msg)
            ? `The file is bigger than storage allows (${MAX_VIDEO_MB} MB).`
            : /403|row-level|policy/i.test(msg)
              ? "You don't have permission to upload to this short."
              : "The upload stopped. Check your connection and try again."
        );
      },
      onSuccess: async () => {
        uploadRef.current = null;
        setSaving(true);
        const res = await registerVersion({
          shortId,
          path,
          fileName: file.name,
          size: file.size,
          mime: file.type,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
        });
        setSaving(false);
        if (res.error !== undefined) {
          setProgress(null);
          toast.error(res.error);
          return;
        }
        toast.success(`v${res.number} uploaded`);
        onUploaded?.(res.id);
        setFinished(true);
        startRefresh(() => router.refresh());
      },
    });
    uploadRef.current = upload;
    upload.start();
  }

  function cancel() {
    uploadRef.current?.abort(true);
    uploadRef.current = null;
    setProgress(null);
    toast.success("Upload cancelled");
  }

  if (progress) {
    const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;
    return (
      <div className="w-full sm:w-80 rounded-xl border border-line/15 bg-surface px-3.5 py-2.5" aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="font-semibold truncate">{finished ? "Updating…" : saving ? "Saving…" : `Uploading v${nextNumber}`}</span>
          <span className="tabular-nums text-ink-soft">
            {formatBytes(progress.sent)} / {formatBytes(progress.total)}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-amber transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        {!saving && !finished && (
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-soft">
            <span>{pct}% · keep this tab open</span>
            <button type="button" onClick={cancel} className="font-semibold hover:text-red">
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`inline-flex items-center gap-1.5 rounded-lg font-bold px-3.5 h-9 text-[13px] transition-[filter] ${
          prominent ? "bg-amber text-white hover:brightness-110" : "border border-line/15 text-ink hover:border-line/30"
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 20h14" />
        </svg>
        {nextNumber === 1 ? "Upload video" : `Upload v${nextNumber}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void start(f);
        }}
      />
    </>
  );
}
