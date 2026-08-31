"use client";

import { useEffect, useState } from "react";
import type { Comment } from "@/lib/types";
import { api } from "@/lib/client-api";
import { useWorkbench } from "@/store/workbench";

type Props = {
  projectId: string;
  targetType: "script" | "materials" | "library" | "storyboard" | "shot";
  targetId: string;
  shotId?: string;
};

export function CommentsPanel({
  projectId,
  targetType,
  targetId,
  shotId,
}: Props) {
  const viewer = useWorkbench((s) => s.viewer);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listComments(projectId, targetType, targetId)
      .then((r) => {
        if (!cancelled) setComments(r.comments);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载评论失败");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, targetType, targetId]);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { comment } = await api.createComment(projectId, {
        targetType,
        targetId,
        shotId,
        parentId: replyTo ?? undefined,
        body: body.trim(),
        authorLabel: label.trim() || undefined,
      });
      if (replyTo) {
        setComments((list) =>
          list.map((c) =>
            c.id === replyTo
              ? { ...c, replies: [...(c.replies ?? []), comment] }
              : c,
          ),
        );
      } else {
        setComments((list) => [comment, ...list]);
      }
      setBody("");
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string, status: "pending" | "resolved") {
    try {
      const { comment } = await api.patchComment(projectId, { id, status });
      setComments((list) => list.map((c) => (c.id === id ? comment : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    }
  }

  return (
    <section className="mt-8 border-t border-ink/10 pt-5">
      <h3 className="text-sm font-medium text-ink/70">审阅意见</h3>
      {viewer?.role === "reviewer" ? (
        <input
          className="mt-2 w-full max-w-xs rounded-sm border border-ink/15 bg-white/80 px-3 py-1.5 text-sm"
          placeholder="你的称呼（可选）"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      ) : null}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <textarea
          className="min-h-[72px] flex-1 rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder={replyTo ? "回复这条意见…" : "写下修改意见…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          {replyTo ? (
            <button
              type="button"
              className="text-xs text-ink/50"
              onClick={() => setReplyTo(null)}
            >
              取消回复
            </button>
          ) : null}
          <button
            type="button"
            className="bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={busy || !body.trim()}
            onClick={() => void submit()}
          >
            {busy ? "发送中…" : replyTo ? "回复" : "发表意见"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-4 flex flex-col gap-4">
        {comments.map((c) => (
          <li key={c.id} className="border-l-2 border-ink/10 pl-3">
            <div className="flex flex-wrap items-baseline gap-2 text-xs text-ink/45">
              <span className="font-medium text-ink/70">
                {c.authorLabel || (c.authorRole === "owner" ? "主账号" : "审阅")}
              </span>
              <span
                className={
                  c.status === "resolved" ? "text-accent" : "text-amber-800"
                }
              >
                {c.status === "resolved" ? "已处理" : "未处理"}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{c.body}</p>
            <div className="mt-1 flex gap-3 text-xs">
              <button
                type="button"
                className="text-accent"
                onClick={() => setReplyTo(c.id)}
              >
                回复
              </button>
              {viewer?.canResolveComment ? (
                <button
                  type="button"
                  className="text-ink/50"
                  onClick={() =>
                    void resolve(
                      c.id,
                      c.status === "resolved" ? "pending" : "resolved",
                    )
                  }
                >
                  {c.status === "resolved" ? "标为未处理" : "标为已处理"}
                </button>
              ) : null}
            </div>
            {c.replies?.length ? (
              <ul className="mt-2 flex flex-col gap-2 border-l border-ink/10 pl-3">
                {c.replies.map((r) => (
                  <li key={r.id}>
                    <p className="text-xs text-ink/45">
                      {r.authorLabel || "回复"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-ink/75">
                      {r.body}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
