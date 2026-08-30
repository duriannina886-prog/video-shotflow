"use client";

import { useState } from "react";
import { useWorkbench } from "@/store/workbench";

export function HistoryPanel() {
  const project = useWorkbench((s) => s.project);
  const latestScript = useWorkbench((s) => s.latestScript);
  const [open, setOpen] = useState(false);
  if (!project) return null;
  const scripts = [...project.scripts].sort((a, b) => b.version - a.version);
  const current = latestScript();

  return (
    <section className="mb-6 border border-ink/10 bg-white/40 px-4 py-3">
      <button
        type="button"
        className="text-sm font-medium text-ink/70"
        onClick={() => setOpen((v) => !v)}
      >
        历史版本库 {open ? "▴" : "▾"}
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <div>
            <p className="text-xs tracking-wide text-ink/45">脚本版本</p>
            <ul className="mt-1 divide-y divide-ink/10">
              {scripts.map((s) => (
                <li key={s.id} className="py-2">
                  <p className="text-ink/70">
                    v{s.version} · {s.source}
                    {s.id === current?.id ? " · 当前" : ""}
                    <span className="ml-2 font-mono text-[11px] text-ink/40">
                      {new Date(s.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </p>
                  {s.id !== current?.id ? (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-ink/55">
                      {s.content}
                    </pre>
                  ) : (
                    <p className="text-xs text-ink/40">
                      工作台正在使用这一版（业务审阅也只看这一版）。
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs tracking-wide text-ink/45">
              当前分镜提示词修订
            </p>
            <ul className="mt-1 flex flex-col gap-2">
              {(current?.shots ?? []).map((shot) => (
                <li key={shot.id}>
                  <p className="font-medium text-ink/70">
                    {String(shot.sequence).padStart(2, "0")} {shot.title}
                    <span className="ml-2 font-normal text-ink/40">
                      {shot.revisions.length} 次修订 · {shot.videos?.length ?? 0}{" "}
                      条成片
                    </span>
                  </p>
                  {shot.revisions.length > 1 ? (
                    <details className="text-xs text-ink/50">
                      <summary className="cursor-pointer">查看历史提示词</summary>
                      <ol className="mt-1 list-decimal space-y-2 pl-4">
                        {shot.revisions.map((r) => (
                          <li key={r.id}>
                            <p className="text-ink/40">
                              {new Date(r.createdAt).toLocaleString("zh-CN")}
                              {r.feedback ? ` · ${r.feedback}` : ""}
                            </p>
                            <pre className="whitespace-pre-wrap text-ink/60">
                              {r.prompt.slice(0, 400)}
                              {r.prompt.length > 400 ? "…" : ""}
                            </pre>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
