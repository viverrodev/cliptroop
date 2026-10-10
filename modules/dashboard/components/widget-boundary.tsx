"use client";

import { Component, Fragment, type ReactNode } from "react";
import { reportBrowserError } from "@/components/error-reporter";

type State = { error: Error | null; attempt: number };

/** Code that couldn't be downloaded: offline for a moment, or a new version went live since the page opened. */
const isLoadError = (e: Error) =>
  e.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(e.message);

/**
 * One widget breaking (or its code not downloading) never takes the whole
 * dashboard down: its own box says so, with Try again (or Reload, when
 * its code didn't arrive). Real errors are reported, like a page's.
 */
export class WidgetBoundary extends Component<{ name: string; children: ReactNode }, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error));
    if (!isLoadError(e)) reportBrowserError({ message: `${this.props.name} widget: ${e.message}`, stack: e.stack });
  }

  render() {
    const { error, attempt } = this.state;
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;
    const load = isLoadError(error);
    return (
      <div role="alert" className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-2 px-2 py-3">
        <p className="text-[12.5px] text-ink-soft leading-snug max-w-[16rem]">{load ? "This widget didn't load." : "This widget hit a problem. It's been reported."}</p>
        <button
          type="button"
          onClick={() => (load ? location.reload() : this.setState((s) => ({ error: null, attempt: s.attempt + 1 })))}
          className="rounded-md border border-line/20 px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/40"
        >
          {load ? "Reload" : "Try again"}
        </button>
      </div>
    );
  }
}
