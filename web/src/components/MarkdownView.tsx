"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/format";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-5 font-display text-2xl font-semibold text-white">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 border-b border-line/70 pb-1 font-display text-lg font-semibold text-gold">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-slate-200">
      {children}
    </h3>
  ),
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold text-slate-200">{children}</h4>,
  p: ({ children }) => <p className="my-2 text-[13px] leading-6 text-slate-300">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-teal underline decoration-teal/40 underline-offset-2 hover:text-white"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-[13px] text-slate-300">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-[13px] text-slate-300">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-gold/60 bg-gold/5 px-3 py-2 text-[13px] text-slate-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="text-slate-200">{children}</em>,
  code: ({ children, className }) => {
    const bloque = Boolean(className?.includes("language-"));
    if (bloque) {
      return <code className={cn("font-mono text-[12px] text-teal", className)}>{children}</code>;
    }
    return (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-amber-200">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-line bg-ink/70 p-3 text-[12px] leading-5">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/5 text-slate-200">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-line px-2.5 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line/50 px-2.5 py-2 align-top text-slate-300">{children}</td>
  ),
};

export function MarkdownView({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
