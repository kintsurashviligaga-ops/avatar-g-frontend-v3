'use client'

/**
 * The answer of a /services/<slug> form, as markdown — in the page's tokens (no cyan or violet headings, no boxes).
 * ServiceWorkspaceView loads it lazily and client-only: an answer only exists after a generation in the browser, so
 * react-markdown and remark-gfm stay out of the server bundle and out of every page that never shows one.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ResultMarkdown({ text }: { text: string }) {
  return (
    <div className="mt-2 min-w-0 text-[16px] leading-[1.6] text-app-text/90 [&_a]:text-app-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-app-border/15 [&_blockquote]:pl-3 [&_blockquote]:text-app-muted [&_code]:rounded [&_code]:bg-app-text/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[14px] [&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-[20px] [&_h1]:font-semibold [&_h1]:text-app-text [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-app-text [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-app-text [&_hr]:my-4 [&_hr]:border-app-border/10 [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-app-bg/60 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-app-text [&_table]:mb-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-[14px] [&_td]:border-b [&_td]:border-app-border/10 [&_td]:py-1.5 [&_td]:pr-3 [&_th]:border-b [&_th]:border-app-border/15 [&_th]:pb-1.5 [&_th]:pr-3 [&_th]:text-left [&_th]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
