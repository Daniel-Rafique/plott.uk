"use client";

/**
 * Safe markdown renderer for AI chat messages.
 *
 * Wraps react-markdown with a conservative allowlist (rehype-sanitize default
 * schema) and tailwind classes that match the rest of the app's chat UI.
 * Anchor tags get `target="_blank"` + `rel="noopener noreferrer"` so any URLs
 * the model emits open safely in a new tab.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["target"],
      ["rel"],
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "del",
  ],
};

export function MarkdownMessage({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-snug [&_p]:m-0 [&_p+p]:mt-2",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5 [&_li>p]:inline",
        "[&_code]:rounded [&_code]:bg-zinc-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-zinc-900 [&_pre]:p-2 [&_pre]:text-xs [&_pre]:text-zinc-100 [&_pre>code]:bg-transparent [&_pre>code]:p-0",
        "[&_a]:text-indigo-700 [&_a]:underline [&_a]:decoration-indigo-300 [&_a:hover]:decoration-indigo-600",
        "[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-300 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-zinc-200 [&_td]:px-2 [&_td]:py-1",
        "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-600",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
