"use client";

import { Ago } from "@/components/ui/ago";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ChevronDownIcon, CloseIcon, ExpandIcon, PlusIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { ScriptEditor } from "./script-editor";
import { ScriptImage } from "./script-image";
import type { DocListItem, ScriptComment, ScriptRow } from "../lib/queries";
import { findQuote } from "../lib/anchors";
import { addComment, createDoc, deleteComment, deleteDoc, getDocContent, renameDoc, resolveComment, resolveComments, saveScript } from "@/app/(dashboard)/scripts/actions";
import { Dialog } from "@/components/ui/dialog";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Lightbox } from "@/components/ui/lightbox";
import { MentionText } from "./comment-composer";
import type { MentionPerson } from "../lib/mention-people";
import type { ScriptFlow } from "../lib/flow";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import { FlowStrip, type FlowPermissions } from "./script-flow";
import { PendingLink, PendingNav, usePendingNav } from "@/components/ui/pending-nav";

type Owner = { short: string } | { long: string };

/**
 * The script workspace: documents on the left (versions + research), the
 * editor in the middle, and a right panel for a side-by-side document or
 * the comments. Built around the regular ScriptEditor.
 * Opening another document answers at once: it lights up in the list and
 * the page shows shimmering lines until its text is here.
 */
export function ScriptWorkspace(props: React.ComponentProps<typeof Workspace>) {
  return (
    <PendingNav>
      <Workspace {...props} />
    </PendingNav>
  );
}

function Workspace({
  owner,
  docs,
  doc,
  canEdit,
  canComment = canEdit,
  canCreate,
  side,
  comments,
  title,
  number,
  backHref,
  backLabel,
  topBarExtra,
  lastEdited,
  roleColors,
  people = [],
  flow,
}: {
  owner: Owner;
  docs: DocListItem[];
  doc: ScriptRow;
  canEdit: boolean;
  /**
   * Add comments and editing ideas, resolve them: the people working on this
   * video's script (masters, its scripters, its Review / Staging people;
   * researchers on research). Everyone else on the team reads them.
   */
  canComment?: boolean;
  canCreate: { script: boolean; research: boolean };
  side: ScriptRow | null;
  comments: ScriptComment[];
  title: string;
  number: number;
  backHref: string;
  backLabel: string;
  topBarExtra?: React.ReactNode;
  lastEdited: string | null;
  /** The team's role colours (dots, comment colours). */
  roleColors: Record<string, string>;
  /** Teammates for @mentions, with what they do on this video. */
  people?: MentionPerson[];
  /** Script → Review → Staging (migration 0062): shown as a strip under the top bar. */
  flow?: {
    data: ScriptFlow;
    team: TeamPerson[];
    can: FlowPermissions;
    scripterAction: (id: string, memberId: string, add: boolean) => Promise<{ error?: string } | object>;
    videoId: string;
  };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  // Another document is on its way (clicked in the list, the steps or the menu).
  const pendingDoc = usePendingNav().pending;
  const switching = pendingDoc !== null && pendingDoc !== doc.id;
  const [sideOpen, setSideOpen] = useState(!!side);
  // ?comment=<id> (from a notification): open the comments on that one.
  const linked = params.get("comment");
  const [chatOpen, setChatOpen] = useState(!!linked && comments.some((c) => c.id === linked));
  const [active, setActive] = useState<string | null>(linked && comments.some((c) => c.id === linked) ? linked : null);
  const [zoomed, setZoomed] = useState<ScriptComment | null>(null);
  useEffect(() => {
    if (linked && comments.some((c) => c.id === linked)) {
      setChatOpen(true);
      setActive(linked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);
  const colorOf = (c: ScriptComment) => commentColor(c, roleColors);
  const open = comments.filter((c) => !c.resolved).length;

  const href = (next: { doc?: string; side?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    q.delete("kind");
    if (next.doc) q.set("doc", next.doc);
    if (next.side === null) q.delete("side");
    else if (next.side) q.set("side", next.side);
    return `?${q.toString()}`;
  };

  const marks = useMemo(
    () => comments.map((c) => ({ id: c.id, quote: c.quote, occurrence: c.occurrence, resolved: c.resolved, color: commentColor(c, roleColors) })),
    [comments, roleColors]
  );

  return (
    <>
    <ScriptEditor
      key={doc.id}
      switching={switching}
      scriptId={doc.id}
      teamId={doc.teamId}
      initialContent={doc.content}
      initialVersion={doc.version}
      canEdit={canEdit}
      title={title}
      number={number}
      backHref={backHref}
      backLabel={backLabel}
      docName={doc.name}
      lastEdited={lastEdited}
      comments={marks}
      activeCommentId={active}
      onCommentClick={(id) => {
        setActive(id);
        setChatOpen(true);
      }}
      people={people}
      roleColors={roleColors}
      onAddComment={
        canComment
          ? async (quote, occurrence, body, kind, sketch) => {
              const r = await addComment({ scriptId: doc.id, quote, occurrence, body, kind, sketch });
              if (r.error !== undefined) return r.error;
              setChatOpen(true);
              setActive(r.id);
              router.refresh();
              return null;
            }
          : undefined
      }
      copySources={docs.filter((d) => d.id !== doc.id).map((d) => ({ id: d.id, name: `${d.kind === "research" ? "Research · " : ""}${d.name}` }))}
      onCopyFrom={async (id) => {
        const r = await getDocContent(id);
        if (r.error !== undefined) {
          toast.error(r.error);
          return null;
        }
        return r.content;
      }}
      subBar={
        flow?.data.ready && doc.kind === "script" ? (
          <FlowStrip
            flow={flow.data}
            currentDocId={doc.id}
            people={flow.team}
            number={number}
            can={flow.can}
            scripterAction={flow.scripterAction}
            videoId={flow.videoId}
            href={(id) => href({ doc: id })}
            roleColors={roleColors}
          />
        ) : undefined
      }
      topBarExtra={
        <>
          {/* Keys: the first child is created on the server (React warns otherwise). */}
          <span key="extra" className="contents">
            {topBarExtra}
          </span>
          <SideBySideMenu
            key="side"
            docs={docs.filter((d) => d.id !== doc.id)}
            active={sideOpen ? side?.id ?? null : null}
            onPick={(id) => {
              setSideOpen(true);
              router.push(href({ side: id }), { scroll: false });
            }}
            onClose={() => {
              setSideOpen(false);
              router.push(href({ side: null }), { scroll: false });
            }}
          />
        </>
      }
      leftRail={<DocRail owner={owner} docs={docs} current={doc.id} sideId={sideOpen ? side?.id ?? null : null} canCreate={canCreate} canEdit={canEdit} href={(id) => href({ doc: id })} roleColors={roleColors} />}
      sideBySide={
        sideOpen && side ? (
          <SidePage
            side={side}
            canEdit={side.kind === "research" ? canCreate.research : canCreate.script}
            swap={href({ doc: side.id, side: doc.id })}
            close={() => {
              setSideOpen(false);
              router.push(href({ side: null }), { scroll: false });
            }}
          />
        ) : undefined
      }
      mobileDocs={<MobileDocs owner={owner} docs={docs} current={doc} canCreate={canCreate} href={(id) => href({ doc: id })} roleColors={roleColors} sideId={sideOpen ? side?.id ?? null : null} />}
      renderCommentPopover={(id, close) => {
        const c = comments.find((x) => x.id === id);
        if (!c) return null;
        const color = colorOf(c);
        return (
          <div className="rounded-xl border border-line/15 bg-surface shadow-2xl p-3 animate-[modalin_.12s_var(--ease-out)]" style={{ boxShadow: `inset 2px 0 0 color-mix(in srgb, ${color} 65%, transparent), 0 20px 50px -20px rgb(0 0 0 / .5)` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <PersonAvatar name={c.author?.name ?? "?"} avatarUrl={c.author?.avatarUrl ?? null} color={c.author?.color ?? "#888"} className="w-5 h-5 text-[9px]" />
              <span className="text-[12.5px] font-semibold text-ink">{c.author?.name ?? "Someone"}</span>
              <span className="rounded-md px-1.5 h-5 inline-flex items-center text-[10.5px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
                {c.kind === "edit_idea" ? "Editing idea" : "Comment"}
              </span>
              <span className="ml-auto text-[11px] text-ink-faint"><Ago iso={c.createdAt} /></span>
            </div>
            <CommentBody c={c} people={people} roleColors={roleColors} onSketch={() => setZoomed(c)} />
            <div className="flex items-center gap-1 mt-2 -mb-1">
              {canComment && (
              <button
                type="button"
                onClick={async () => {
                  if (!c.resolved && !(await confirmResolve(confirm, c))) return;
                  const r = await resolveComment(c.id, !c.resolved);
                  if (r.error) toast.error(r.error);
                  else {
                    close();
                    router.refresh();
                  }
                }}
                className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                {c.resolved ? "Reopen" : "Resolve"}
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  close();
                  setActive(c.id);
                  setChatOpen(true);
                }}
                className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                All comments
              </button>
              <span className="flex-1" />
              <button type="button" onClick={close} aria-label="Close" className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }}
      rightPanel={
        <CommentsChat
          // A fresh panel per document (its own comments, its own "text changed" check).
          key={doc.id}
          open={chatOpen}
          setOpen={setChatOpen}
          comments={comments}
          active={active}
          onPick={setActive}
          docId={doc.id}
          docName={doc.name}
          number={number}
          docContent={doc.content}
          colorOf={colorOf}
          roleColors={roleColors}
          exportTitle={title}
          people={people}
          onSketch={setZoomed}
          canComment={canComment}
        />
      }
    />
    {zoomed?.sketch && <Lightbox src={zoomed.sketch.url} alt={`Sketch: ${zoomed.body}`} download={`sketch-${zoomed.id.slice(0, 8)}.png`} onClose={() => setZoomed(null)} />}
    </>
  );
}

/** Resolving hides a comment / editing idea from the list: ask first. */
function confirmResolve(confirm: ReturnType<typeof useConfirm>, c: ScriptComment) {
  const idea = c.kind === "edit_idea";
  return confirm({
    title: idea ? "Resolve this editing idea?" : "Resolve this comment?",
    description: `It's marked as done and hidden from the list (Show resolved brings it back). You can reopen it any time.`,
    confirmLabel: "Resolve",
  });
}

/** A comment's text (mentions highlighted) and its sketch, if it has one. */
function CommentBody({ c, people, roleColors, onSketch }: { c: ScriptComment; people: MentionPerson[]; roleColors: Record<string, string>; onSketch: () => void }) {
  const onlySketch = !!c.sketch && c.body.trim() === "Sketch";
  return (
    <>
      {!onlySketch && (
        <p className="text-[13.5px] text-ink whitespace-pre-wrap break-words">
          <MentionText text={c.body} people={people} roleColors={roleColors} />
        </p>
      )}
      {c.sketch && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSketch();
          }}
          className="group/sk relative mt-1.5 block w-full rounded-lg border border-line/15 bg-white overflow-hidden hover:border-line/35 transition-colors"
          aria-label="Open the sketch"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.sketch.url} alt="Sketch" loading="lazy" className="w-full max-h-40 object-contain" />
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 text-white px-1.5 h-5 inline-flex items-center text-[10.5px] font-semibold opacity-0 group-hover/sk:opacity-100 transition-opacity">View</span>
        </button>
      )}
    </>
  );
}

function DocRail({
  owner,
  docs,
  current,
  canCreate,
  canEdit,
  href,
  roleColors,
  sideId,
}: {
  owner: Owner;
  docs: DocListItem[];
  current: string;
  /** Open on the right: shown, but not openable on the left too. */
  sideId: string | null;
  canCreate: { script: boolean; research: boolean };
  canEdit: boolean;
  href: (id: string) => string;
  roleColors: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = usePendingNav();
  // The document on its way counts as open already.
  const shown = nav.pending ?? current;
  const [renaming, setRenaming] = useState<string | null>(null);
  // The main documents carry the colour of the role that works on them.
  const DOT: Record<string, string | undefined> = {
    Script: roleColors.scripter,
    Review: roleColors.master,
    Staging: roleColors.editor,
    Research: roleColors.researcher,
  };
  const groups = [
    { kind: "script" as const, label: "Versions", add: "Add version", can: canCreate.script },
    ...("long" in owner ? [{ kind: "research" as const, label: "Research", add: "Add research", can: canCreate.research }] : []),
  ];
  const DEFAULTS = ["Script", "Review", "Staging", "Research"];

  const [adding, setAdding] = useState<"script" | "research" | null>(null);
  const add = (kind: "script" | "research") => setAdding(kind);

  return (
    <nav className="lg:sticky lg:top-[10.5rem] lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto px-3 lg:px-4 pt-3 lg:py-6" aria-label="Documents">
      <div className="flex lg:flex-col gap-3 lg:gap-5 p-1">
        {groups.map((g) => (
          <div key={g.kind} className="flex lg:flex-col gap-1 flex-shrink-0">
            <div className="hidden lg:block px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{g.label}</div>
            {docs
              .filter((d) => d.kind === g.kind)
              .map((d) => (
                <div key={d.id} className="group relative flex-shrink-0">
                  {d.id === sideId ? (
                    <div className="flex items-center gap-2.5 rounded-lg pl-3 pr-3 h-9 lg:h-10 text-[13.5px] whitespace-nowrap text-ink-faint cursor-default" title="Open on the right">
                      <span aria-hidden className="w-2 h-2 rounded-full flex-shrink-0 opacity-60" style={{ background: DOT[d.name] ?? "rgb(var(--line) / .4)" }} />
                      <span className="truncate">{d.name}</span>
                      <span className="hidden lg:inline ml-auto text-[10.5px] font-bold uppercase">On the right</span>
                    </div>
                  ) : renaming === d.id ? (
                    <input
                      autoFocus
                      defaultValue={d.name}
                      maxLength={60}
                      onBlur={async (e) => {
                        setRenaming(null);
                        const name = e.target.value.trim();
                        if (name && name !== d.name) {
                          const r = await renameDoc(d.id, name);
                          if (r.error !== undefined) toast.error(r.error);
                          else router.refresh();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="w-36 lg:w-full rounded-lg border border-amber bg-surface px-2.5 h-9 text-[13px] font-semibold outline-none"
                    />
                  ) : (
                    <PendingLink
                      href={href(d.id)}
                      navKey={d.id}
                      prefetch={false}
                      onDoubleClick={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        setRenaming(d.id);
                      }}
                      title={canEdit ? "Double-click to rename" : undefined}
                      aria-current={d.id === shown ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg pl-3 pr-8 h-9 lg:h-10 text-[13.5px] whitespace-nowrap transition-colors ${
                        d.id === shown ? "bg-amber/12 text-ink font-bold ring-1 ring-amber/40" : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: DOT[d.name] ?? "transparent", boxShadow: DOT[d.name] ? undefined : "inset 0 0 0 1.5px rgb(var(--line) / 0.35)" }}
                      />
                      <span className="truncate">{d.name}</span>
                      <span className="hidden lg:inline ml-auto text-[11px] font-normal text-ink-faint tabular-nums">{d.wordCount}w</span>
                    </PendingLink>
                  )}
                  {canEdit && !DEFAULTS.includes(d.name) && renaming !== d.id && (
                    <button
                      type="button"
                      aria-label={`Delete ${d.name}`}
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete “${d.name}”?`, description: "Its text and comments are deleted.", confirmLabel: "Delete", danger: true }))) return;
                        const r = await deleteDoc(d.id);
                        if (r.error !== undefined) toast.error(r.error);
                        else router.push(href(docs.find((x) => x.kind === "script" && x.id !== d.id)?.id ?? current), { scroll: false });
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-ink-faint hover:text-red opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            {g.can && (
              <button
                type="button"
                onClick={() => add(g.kind)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 border border-dashed border-line/25"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                {g.add}
              </button>
            )}
          </div>
        ))}
      </div>
      <AddDocDialog
        kind={adding}
        owner={owner}
        suggested={adding === "research" ? `Research ${docs.filter((d) => d.kind === "research").length + 1}` : `Version ${docs.filter((d) => d.kind === "script").length + 1}`}
        onClose={() => setAdding(null)}
        onCreated={(id) => {
          setAdding(null);
          nav.go(href(id), id);
        }}
      />
    </nav>
  );
}

/** "+ Add version / research": name it, then confirm. */
function AddDocDialog({
  kind,
  owner,
  suggested,
  onClose,
  onCreated,
}: {
  kind: "script" | "research" | null;
  owner: Owner;
  suggested: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(""), [kind]);
  const submit = async () => {
    setBusy(true);
    const r = await createDoc({ ...("short" in owner ? { short: owner.short } : { long: owner.long }), kind: kind ?? "script", name: name.trim() || suggested });
    setBusy(false);
    if (r.error !== undefined) toast.error(r.error);
    else {
      toast.success(`“${name.trim() || suggested}” added`);
      onCreated(r.id);
    }
  };
  return (
    <Dialog
      open={!!kind}
      onClose={() => !busy && onClose()}
      title={kind === "research" ? "Add a research document" : "Add a script version"}
      description="It starts empty; you can copy another document into it."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
            {busy ? "Adding…" : "Add"}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          maxLength={60}
          placeholder={suggested}
          className="w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber"
        />
      </label>
    </Dialog>
  );
}

/** Side by side: pick the document right from the button. */
function SideBySideMenu({ docs, active, onPick, onClose }: { docs: DocListItem[]; active: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !(e.target as HTMLElement).closest("[data-side-menu]") && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div className="relative hidden lg:block" data-side-menu>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-[12px] font-semibold ${active ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
      >
        Side by side
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-60 rounded-xl border border-line/15 bg-surface shadow-2xl p-1.5 animate-[modalin_.12s_var(--ease-out)]">
          <div className="px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Show next to this one</div>
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(d.id);
              }}
              className={`w-full text-left flex items-center gap-2 rounded-lg px-2.5 h-9 text-[13px] ${d.id === active ? "bg-amber/10 font-bold" : "hover:bg-surface-2"}`}
            >
              <span className="truncate">{d.kind === "research" ? "Research · " : ""}{d.name}</span>
            </button>
          ))}
          {active && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onClose();
              }}
              className="w-full text-left rounded-lg px-2.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 border-t border-line/10 mt-1"
            >
              Close side by side
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Phones / tablets: the current document as a dropdown (a sheet with all of them). */
function MobileDocs({
  owner,
  docs,
  current,
  canCreate,
  href,
  roleColors,
  sideId,
}: {
  owner: Owner;
  docs: DocListItem[];
  current: ScriptRow;
  canCreate: { script: boolean; research: boolean };
  href: (id: string) => string;
  roleColors: Record<string, string>;
  sideId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const nav = usePendingNav();
  // The document on its way counts as open already.
  const shownDoc = (nav.pending && docs.find((d) => d.id === nav.pending)) || current;
  const [adding, setAdding] = useState<"script" | "research" | null>(null);
  const DOT: Record<string, string | undefined> = { Script: roleColors.scripter, Review: roleColors.master, Staging: roleColors.editor, Research: roleColors.researcher };
  const groups = [
    { kind: "script" as const, label: "Versions", can: canCreate.script },
    ...("long" in owner ? [{ kind: "research" as const, label: "Research", can: canCreate.research }] : []),
  ];
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 pl-2.5 pr-2 h-9 text-[13px] font-bold max-w-[9.5rem]">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT[shownDoc.name] ?? "rgb(var(--line) / .4)" }} />
        <span className="truncate">{shownDoc.name}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 text-ink-soft" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} label="Documents">
          <div className="p-2">
            {groups.map((g) => (
              <div key={g.kind} className="mb-2">
                <div className="px-2 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{g.label}</div>
                {docs
                  .filter((d) => d.kind === g.kind)
                  .map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={d.id === sideId}
                      onClick={() => {
                        setOpen(false);
                        nav.go(href(d.id), d.id);
                      }}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 h-12 text-[15px] disabled:opacity-45 ${d.id === shownDoc.id ? "bg-amber/10 font-bold" : "hover:bg-surface-2"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[d.name] ?? "rgb(var(--line) / .4)" }} />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto text-[12px] text-ink-faint">{d.wordCount} words</span>
                    </button>
                  ))}
                {g.can && (
                  <button type="button" onClick={() => setAdding(g.kind)} className="w-full flex items-center gap-2 rounded-xl px-3 h-11 text-[14px] font-semibold text-ink-soft hover:bg-surface-2">
                    <PlusIcon className="w-4 h-4" />
                    {g.kind === "research" ? "Add research" : "Add version"}
                  </button>
                )}
              </div>
            ))}
          </div>
      </AnchoredMenu>
      <AddDocDialog
        kind={adding}
        owner={owner}
        suggested={adding === "research" ? `Research ${docs.filter((d) => d.kind === "research").length + 1}` : `Version ${docs.filter((d) => d.kind === "script").length + 1}`}
        onClose={() => setAdding(null)}
        onCreated={(id) => {
          setAdding(null);
          setOpen(false);
          nav.go(href(id), id);
        }}
      />
    </>
  );
}

/**
 * Another document as an equal page next to the one being written. Its
 * title row lines up with the main page's; it's editable (with its own
 * autosave) for people who may edit it.
 */
function SidePage({ side, canEdit, swap, close }: { side: ScriptRow; canEdit: boolean; swap: string; close: () => void }) {
  const toast = useToast();
  const version = useRef(side.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "conflict">("saved");
  // Dark / light paper follows the main page.
  const [paper, setPaper] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const v = localStorage.getItem("vp:script-paper");
      if (v === "light" || v === "dark") setPaper(v);
    } catch {
      /* private mode */
    }
    const on = (e: Event) => setPaper((e as CustomEvent<"light" | "dark">).detail);
    window.addEventListener("vp-paper", on);
    return () => window.removeEventListener("vp-paper", on);
  }, []);
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: canEdit,
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }), Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }), TaskList, TaskItem.configure({ nested: true }), ScriptImage],
      content: side.content,
      editorProps: { attributes: { class: "script-doc outline-none" } },
      onUpdate: ({ editor: e }) => {
        if (!canEdit) return;
        setStatus("unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          setStatus("saving");
          const text = e.getText();
          const r = await saveScript({ scriptId: side.id, expectedVersion: version.current, content: e.getJSON(), text, wordCount: text.trim() ? text.trim().split(/\s+/).length : 0 });
          if (r.ok) {
            version.current = r.version;
            setStatus("saved");
          } else if ("conflict" in r) {
            setStatus("conflict");
            toast.error(`Someone else saved “${side.name}”. Reload to see their version.`);
          } else {
            setStatus("unsaved");
            toast.error(r.error);
          }
        }, 1200);
      },
    },
    [side.id]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div className="min-w-0">
      {/* Same height as the main page's title row, so both pages line up. */}
      <div className="h-8 mb-2 flex items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft truncate">
          {side.kind === "research" ? "Research · " : ""}
          {side.name}
        </span>
        <span className={`text-[11.5px] font-semibold ${status === "conflict" ? "text-red" : status === "saved" ? "text-green" : "text-ink-soft"}`}>
          {!canEdit ? "View only" : status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Not saved" : "Unsaved"}
        </span>
        <span className="flex-1" />
        <Link href={swap} scroll={false} prefetch={false} className="rounded-md px-2 h-7 inline-flex items-center text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Open here
        </Link>
        <button type="button" onClick={close} aria-label="Close side by side" className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div data-paper={paper} className="script-paper mx-auto w-full max-w-[794px] rounded-md border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] px-6 sm:px-[72px] py-10 sm:py-[72px] min-h-[60vh] transition-colors">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** One colour per type, everywhere: comments orange, editing ideas blue. */
export const TYPE_COLOR = { comment: "rgb(var(--amber))", edit_idea: "rgb(59 130 246)" } as const;
function commentColor(c: ScriptComment, _roleColors?: Record<string, string>) {
  return TYPE_COLOR[c.kind];
}

/**
 * Comments as a small chat: a floating button, a panel on desktop, a sheet on
 * phones. Every document has its own (this video's Script, Review, Staging,
 * Research…): the panel names the one it belongs to. Comments left on words
 * that were rewritten since are kept apart at the end, so they never look
 * like they came from somewhere else.
 */
function CommentsChat({
  open,
  setOpen,
  comments,
  active,
  onPick,
  docId,
  docName,
  number,
  docContent,
  colorOf,
  roleColors,
  exportTitle,
  people,
  onSketch,
  canComment,
}: {
  canComment: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  comments: ScriptComment[];
  active: string | null;
  onPick: (id: string) => void;
  docId: string;
  docName: string;
  number: number;
  docContent: Record<string, unknown>;
  colorOf: (c: ScriptComment) => string;
  roleColors: Record<string, string>;
  exportTitle: string;
  people: MentionPerson[];
  onSketch: (c: ScriptComment) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<"all" | "comment" | "edit_idea">("all");
  // The big view, like the other chats.
  const [big, setBig] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const openCount = comments.filter((c) => !c.resolved).length;
  const list = comments.filter((c) => (showResolved || !c.resolved) && (filter === "all" || c.kind === filter));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, comments.length]);
  // Which quotes can no longer be found (the text was rewritten). Null until the text is read.
  const [missing, setMissing] = useState<Set<string> | null>(null);
  const ed = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit, ScriptImage, TaskList, TaskItem], content: docContent }, [docContent]);
  useEffect(() => {
    if (!ed) return;
    setMissing(new Set(comments.filter((c) => !findQuote(ed.state.doc, c.quote, c.occurrence)).map((c) => c.id)));
  }, [ed, comments]);
  const here = missing ? list.filter((c) => !missing.has(c.id)) : list;
  const gone = missing ? list.filter((c) => missing.has(c.id)) : [];
  const goneOpenIds = gone.filter((c) => !c.resolved).map((c) => c.id);
  // The rewritten ones fold away when there are others to read; they're open when they're all there is.
  const [goneShown, setGoneShown] = useState<boolean | null>(null);
  const showGone = goneShown ?? here.length === 0;
  const [resolvingGone, setResolvingGone] = useState(false);

  async function act(fn: () => Promise<{ error?: string }>) {
    const r = await fn();
    if (r.error) toast.error(r.error);
    else router.refresh();
  }

  async function resolveGone() {
    if (!goneOpenIds.length || resolvingGone) return;
    const n = goneOpenIds.length;
    const ok = await confirm({
      title: `Resolve ${n === 1 ? "this one" : `these ${n}`}?`,
      description: `${n === 1 ? "It was" : "They were"} left on words that are no longer in ${docName}. Resolved ones stay under "Show resolved", and can be reopened.`,
      confirmLabel: "Resolve",
    });
    if (!ok) return;
    setResolvingGone(true);
    const r = await resolveComments(docId, goneOpenIds);
    setResolvingGone(false);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success(r.resolved === 1 ? "Resolved." : `Resolved ${r.resolved}.`);
    router.refresh();
  }

  const card = (c: ScriptComment) => {
    const color = colorOf(c);
    return (
      <article
        key={c.id}
        onClick={() => onPick(c.id)}
        className={`rounded-xl border p-3 cursor-pointer transition-colors ${c.resolved ? "opacity-55" : ""} ${c.id === active ? "border-line/40" : "border-line/10 hover:border-line/25"}`}
        style={{ background: `color-mix(in srgb, ${color} 5%, transparent)`, boxShadow: `inset 2px 0 0 color-mix(in srgb, ${color} 65%, transparent)` }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <PersonAvatar name={c.author?.name ?? "?"} avatarUrl={c.author?.avatarUrl ?? null} color={c.author?.color ?? "#888"} className="w-6 h-6 text-[10px]" />
          <span className="text-[12.5px] font-semibold text-ink truncate">{c.author?.name ?? "Someone"}</span>
          <span className="rounded-md px-1.5 h-5 inline-flex items-center text-[10.5px] font-semibold flex-shrink-0" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
            {c.kind === "edit_idea" ? "Editing idea" : "Comment"}
          </span>
          <span className="ml-auto text-[11px] text-ink-faint whitespace-nowrap">
            <Ago iso={c.createdAt} />
          </span>
        </div>
        <div className="text-[12px] text-ink-soft pl-2 mb-1.5 line-clamp-2 border-l-2" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}>
          “{c.quote}”
          {missing?.has(c.id) && (
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[10.5px] font-bold" title="These words were changed or deleted since">
              text changed
            </span>
          )}
        </div>
        <CommentBody c={c} people={people} roleColors={roleColors} onSketch={() => onSketch(c)} />
        {canComment && (
          <div className="flex items-center gap-1 mt-1.5 -mb-1">
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (!c.resolved && !(await confirmResolve(confirm, c))) return;
                void act(() => resolveComment(c.id, !c.resolved));
              }}
              className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
            >
              {c.resolved ? "Reopen" : "Resolve"}
            </button>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const idea = c.kind === "edit_idea";
                const ok = await confirm({
                  title: idea ? "Delete this editing idea?" : "Delete this comment?",
                  description: c.sketch ? "Its drawing is deleted too. This can't be undone." : "This can't be undone.",
                  confirmLabel: "Delete",
                  danger: true,
                });
                if (ok) void act(() => deleteComment(c.id));
              }}
              className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-red hover:bg-red/10"
            >
              Delete
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="no-print fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6 inline-flex items-center gap-2 rounded-full bg-surface-2 text-ink border border-line/20 pl-4 pr-3 h-11 text-[13.5px] font-bold shadow-[0_12px_30px_-10px_rgb(0_0_0/0.6)] hover:border-line/40 hover:scale-[1.03] transition-transform"
        >
          Comments
          <span className={`rounded-full px-2 h-6 inline-flex items-center text-[12px] ${openCount ? "bg-amber text-white" : "bg-line/15 text-ink-soft"}`}>{openCount}</span>
        </button>
      )}
      {open && big && (
        <div className="no-print fixed inset-0 z-[39] bg-black/55 animate-[fadein_.15s_ease]" onClick={() => setBig(false)} aria-hidden />
      )}
      {open && (
        <section
          key={big ? "big" : "small"}
          className={`no-print fixed z-40 bg-surface border border-line/15 shadow-2xl flex flex-col ${big ? "animate-[modalin_.22s_var(--ease-out)]" : "animate-[modalin_.18s_var(--ease-out)]"} ${
            big
              ? "inset-2 sm:inset-6 lg:inset-x-[max(1.5rem,calc(50vw-28rem))] lg:inset-y-8 rounded-2xl"
              : "inset-x-2 bottom-2 h-[78dvh] rounded-2xl lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[400px] lg:h-[min(620px,calc(100dvh-9rem))]"
          }`}
          aria-label="Comments"
        >
          <header className="px-4 pt-3.5 pb-2.5 border-b border-line/10 space-y-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[15px] font-bold">Comments</h2>
              <span className="text-[12.5px] text-ink-soft whitespace-nowrap">{openCount} open</span>
              {/* Each document has its own comments: say which one these are. */}
              <span className="min-w-0 truncate rounded-md bg-surface-2 px-1.5 h-5 inline-flex items-center text-[11px] font-semibold text-ink-soft" title={`Comments on ${docName} of #${number} only`}>
                {docName} · #{number}
              </span>
              <span className="flex-1" />
              <button type="button" onClick={() => setBig((b) => !b)} aria-label={big ? "Smaller" : "Bigger"} title={big ? "Smaller" : "Big view"} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <ExpandIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close comments" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Show">
              {([
                ["all", "All", null],
                ["comment", "Comments", TYPE_COLOR.comment],
                ["edit_idea", "Editing ideas", TYPE_COLOR.edit_idea],
              ] as const).map(([k, label, dot]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={filter === k}
                  onClick={() => setFilter(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-[12.5px] font-semibold transition-colors ${filter === k ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
                >
                  {dot && <span className="w-2 h-2 rounded-[3px]" style={{ background: dot }} />}
                  {label}
                </button>
              ))}
            </div>
          </header>
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
            {!list.length && (
              <p className="text-[13px] text-ink-soft text-center px-6 py-10">
                {comments.length ? "Nothing here with this filter." : `No comments on ${docName} yet. Select text, then choose Comment or Editing idea.`}
              </p>
            )}
            {here.map(card)}
            {gone.length > 0 && (
              <div className={here.length ? "pt-2" : ""}>
                <div className="rounded-xl border border-dashed border-line/20 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setGoneShown(!showGone)}
                    aria-expanded={showGone}
                    className="w-full flex items-center gap-2 text-left text-[12.5px] font-semibold text-ink-soft hover:text-ink"
                  >
                    <ChevronDownIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${showGone ? "" : "-rotate-90"}`} />
                    <span className="flex-1">On text that changed since · {gone.length}</span>
                  </button>
                  <p className="mt-1 text-[11.5px] text-ink-faint leading-snug">
                    Left on earlier words of this {docName} that were rewritten or deleted since. Nothing here comes from another script or video.
                  </p>
                  {canComment && goneOpenIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void resolveGone()}
                      disabled={resolvingGone}
                      className="mt-2 rounded-md border border-line/20 px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-60"
                    >
                      {resolvingGone ? "Resolving…" : goneOpenIds.length === 1 ? "Resolve it" : `Resolve all ${goneOpenIds.length}`}
                    </button>
                  )}
                </div>
                {showGone && <div className="mt-2.5 space-y-2.5 animate-[fadein_.2s_ease]">{gone.map(card)}</div>}
              </div>
            )}
          </div>
          <footer className="px-4 py-2.5 border-t border-line/10 flex items-center gap-2 flex-wrap text-[12px] text-ink-soft pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
            <span className="flex-1 min-w-[8rem]">{canComment ? "Select text, then Enter to add." : "Only this video's scripters and its Review and Staging people can comment."}</span>
            {comments.some((c) => c.kind === "edit_idea") && (
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold">Export ideas</span>
                {(["docx", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={async () => {
                      // Editing ideas in the order they appear in the script.
                      const ideas = comments
                        .filter((c) => c.kind === "edit_idea" && !c.resolved)
                        .map((c) => ({ c, at: ed ? findQuote(ed.state.doc, c.quote, c.occurrence)?.from ?? Infinity : Infinity }))
                        .sort((a, b) => a.at - b.at)
                        .map(({ c }) => ({ quote: c.quote, idea: c.sketch && c.body.trim() === "Sketch" ? "" : c.body, sketch: c.sketch?.url ?? null }));
                      if (!ideas.length) return toast.error("No open editing ideas to export.");
                      const { exportIdeasDocx, exportIdeasPdf } = await import("../lib/export-docx");
                      if (f === "docx") await exportIdeasDocx(ideas, exportTitle, `${exportTitle} - editing ideas`.replace(/[\\/:*?"<>|]+/g, ""));
                      else if (!exportIdeasPdf(ideas, exportTitle)) toast.error("Allow pop-ups to print the PDF.");
                    }}
                    className="rounded-md border border-line/20 px-2 h-7 font-bold uppercase text-[10.5px] text-ink hover:border-line/40"
                  >
                    {f === "docx" ? "Word" : "PDF"}
                  </button>
                ))}
              </span>
            )}
            {comments.some((c) => c.resolved) && (
              <button type="button" onClick={() => setShowResolved((v) => !v)} className="font-semibold hover:text-ink">
                {showResolved ? "Hide resolved" : `Show resolved (${comments.filter((c) => c.resolved).length})`}
              </button>
            )}
          </footer>
        </section>
      )}
    </>
  );
}
