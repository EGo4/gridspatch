// src/components/board/modals/CommentsDialog.tsx
//
// Per-employee/day comment thread. Fetched on demand by the effect in
// BoardClient that watches `commentsFor`; this component is purely the
// dialog's JSX and event wiring.

import { useTranslations } from "next-intl";
import type { EmployeeDayCommentDto } from "~/server/actions/comments";

type CommentsDialogProps = {
  commentsFor: { employeeId: string; day: string } | null;
  employeeName: string;
  commentsList: EmployeeDayCommentDto[] | null;
  commentDraft: string;
  onDraftChange: (value: string) => void;
  commentSaving: boolean;
  commentError: boolean;
  locale: string;
  onClose: () => void;
  onSubmit: () => void;
  onRemove: (commentId: string) => void;
};

export function CommentsDialog({
  commentsFor,
  employeeName,
  commentsList,
  commentDraft,
  onDraftChange,
  commentSaving,
  commentError,
  locale,
  onClose,
  onSubmit,
  onRemove,
}: CommentsDialogProps) {
  const t = useTranslations("Board");
  const tCommon = useTranslations("Common");

  if (!commentsFor) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t("commentsTitle", { name: employeeName })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            title={tCommon("close")}
            className="flex items-center rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {commentsList === null ? (
            <p className="text-xs text-[var(--color-text-muted)]">…</p>
          ) : commentsList.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t("commentsEmpty")}</p>
          ) : (
            commentsList.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--color-text-primary)] whitespace-pre-wrap break-words">{c.text}</p>
                  <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                    {c.authorName} · {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(c.createdAtIso))}
                  </p>
                </div>
                {c.canDelete && (
                  <button
                    type="button"
                    onClick={() => onRemove(c.id)}
                    title={t("deleteComment")}
                    className="flex-shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
          {commentError && <p className="text-xs text-red-500">{t("commentError")}</p>}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
          <input
            type="text"
            value={commentDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
            placeholder={t("commentsPlaceholder")}
            className="flex-1 min-w-0 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={commentSaving || !commentDraft.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {t("addComment")}
          </button>
        </div>
      </div>
    </>
  );
}
