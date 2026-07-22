"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders the builder-facing MMM handleiding (lib/handleiding.ts reads it server-side from
// MMM_HANDLEIDING_DATA_ANALIST.md) in-app, so a data-analist doesn't need to leave the
// wizard to look up how a step or AI-feature works. No typography plugin installed, so
// every markdown element gets an explicit dark-theme mapping instead of a `prose` class.
const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-6 text-lg font-semibold text-fg first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-6 border-t border-border pt-5 text-base font-semibold text-fg first:mt-0 first:border-0 first:pt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-4 text-sm font-semibold text-fg">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3 text-sm leading-relaxed text-fg-muted">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="text-fg">{children}</em>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-fg-muted">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-fg-muted">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="marker:text-fg-faint">{children}</li>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-3 border-l-2 border-accent/40 bg-accent-dim/40 py-1.5 pl-3 text-sm text-fg-muted">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.8em] text-fg">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs text-fg">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-5 border-border" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="border-b border-border-strong">{children}</thead>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-fg">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-t border-border px-2 py-1.5 align-top text-fg-muted">{children}</td>
  ),
};

export function GuideModal({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  // Portal to <body>: the trigger button lives inside TopBar's <header>, which has
  // backdrop-blur (a CSS filter). A filter on an ancestor creates a new containing block
  // for `position: fixed` descendants, so rendering the overlay in place would squash it
  // into the header's own (small) box instead of covering the viewport. Mounted-check
  // avoids a server/client mismatch (document doesn't exist during SSR).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Handleiding"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-fg-muted transition hover:border-border-strong hover:text-fg sm:px-3"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Handleiding</span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 pt-10 sm:pt-16">
            <button
              aria-label="Handleiding sluiten"
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-fg/30 backdrop-blur-sm"
            />
            <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-panel">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                  <BookOpen className="h-4 w-4 flex-none text-accent" />
                  Handleiding — Media Mix Model
                </span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Sluiten"
                  className="rounded-md p-1 text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {markdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
