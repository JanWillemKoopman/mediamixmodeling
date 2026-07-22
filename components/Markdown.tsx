"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Gedeelde markdown-weergave voor AI-tekst die aan de gebruiker wordt getoond (chatberichten,
// klantsamenvatting, diepgaande analyse). Deze teksten worden door de system-prompts bewust
// met kopjes/bullets/**vet** opgemaakt (zie lib/anthropic/*.ts) — zonder dit component
// verschijnen die markdown-tekens gewoon letterlijk in de tekst. Compacter dan GuideModal's
// eigen mapping (kleinere marges), omdat dit in smalle kaarten/bubbels terechtkomt.
const COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-3 text-sm font-semibold text-fg first:mt-0">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-3 text-sm font-semibold text-fg first:mt-0">{children}</h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-2.5 text-sm font-semibold text-fg first:mt-0">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="marker:text-fg-faint">{children}</li>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-2 border-l-2 border-accent/40 bg-accent-dim/40 py-1 pl-3 last:mb-0">{children}</blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="border-b border-border-strong">{children}</thead>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="whitespace-nowrap px-2 py-1 text-left font-medium text-fg">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => <td className="border-t border-border px-2 py-1 align-top">{children}</td>,
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
