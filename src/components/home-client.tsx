"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ReviewLinksPanel } from "@/components/review-links-panel";
import { api } from "@/lib/client-api";
import type { ProjectListItem } from "@/lib/types";

export function HomeClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [role, setRole] = useState<"owner" | "reviewer" | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        if (cancelled) return;
        setProjects(list.projects);
        setRole(list.role);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isReviewer = role === "reviewer";

  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-14">
      <header className="relative overflow-hidden border-b border-ink/10 pb-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.28em] text-accent uppercase">
              Shotflow
            </p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              {isReviewer ? "脚本审阅" : "短视频 AI 分镜与资产"}
            </h1>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-ink/60">
              {isReviewer
                ? "可查看四步、发表意见、上传参考图。不能改脚本、提示词或删除素材。"
                : "脚本 → 素材建议 → 分类资源库 → 分镜提示词与自动配图 → 插件发送豆包"}
            </p>
          </div>
          {role ? (
            <button
              type="button"
              className="text-xs text-ink/45 hover:text-accent"
              onClick={() =>
                void api.logout().then(() => {
                  window.location.href = "/login";
                })
              }
            >
              {isReviewer ? "退出审阅" : "退出登录"}
            </button>
          ) : null}
        </div>
      </header>

      <section className="grid gap-10 lg:grid-cols-2">
        {isReviewer ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium tracking-wide text-ink/50">
              审阅说明
            </h2>
            <p className="text-sm leading-relaxed text-ink/60">
              左侧列表是这条链接授权的脚本项目，始终显示当前最新一版脚本和分镜。有意见直接写在各步骤评论里；参考图传到资源库即可，会标成「审阅方上传」。
            </p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                try {
                  const { project } = await api.createProject({
                    title: title.trim() || "未命名项目",
                    brief: brief.trim(),
                    sellingPoints: sellingPoints.trim(),
                  });
                  router.push(`/projects/${project.id}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "创建失败");
                }
              });
            }}
          >
            <h2 className="text-sm font-medium tracking-wide text-ink/50">
              新建项目
            </h2>
            <input
              required
              className="rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="项目标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              required
              className="min-h-[100px] rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="核心业务诉求"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <textarea
              className="min-h-[80px] rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="产品卖点（可选）"
              value={sellingPoints}
              onChange={(e) => setSellingPoints(e.target.value)}
            />
            <button
              type="submit"
              disabled={pending}
              className="bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "创建中…" : "进入工作台"}
            </button>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </form>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium tracking-wide text-ink/50">
            {isReviewer ? "可审阅的脚本项目" : "最近项目"}
          </h2>
          {loading ? (
            <p className="text-sm text-ink/40">加载中…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-ink/40">
              {isReviewer
                ? "这条链接还没有授权任何脚本项目。"
                : "还没有项目，先在左侧创建。"}
            </p>
          ) : (
            <ul className="divide-y divide-ink/10 border-t border-ink/10">
              {projects.map((p) => {
                const shotCount = p.scripts[0]?._count.shots ?? 0;
                return (
                  <li key={p.id}>
                    <a
                      href={`/projects/${p.id}`}
                      className="flex items-baseline justify-between gap-4 py-3 transition hover:text-accent"
                    >
                      <span className="font-medium text-ink">{p.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink/40">
                        {p.currentStep} · {shotCount} shots
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {isReviewer && error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : null}
        </div>
      </section>

      {role === "owner" ? <ReviewLinksPanel projects={projects} /> : null}
    </main>
  );
}
