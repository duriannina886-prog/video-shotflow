"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ASSET_CATEGORIES,
  WORKFLOW_STEPS,
  type WorkflowStep,
} from "@/lib/categories";
import { api } from "@/lib/client-api";
import type { StylePresetMeta } from "@/lib/types";
import { stepOf, useWorkbench } from "@/store/workbench";
import { AssetLibrary } from "@/components/asset-library";
import { LibraryTray } from "@/components/library-tray";
import { ShotCard } from "@/components/shot-card";
import { CommentsPanel } from "@/components/comments-panel";
import { HistoryPanel } from "@/components/history-panel";

type Props = { projectId: string };

export function Workbench({ projectId }: Props) {
  const {
    project,
    setProject,
    setViewer,
    viewer,
    busy,
    setBusy,
    error,
    setError,
    latestScript,
    latestShots,
    activeShotId,
  } = useWorkbench();
  const canEdit = viewer?.canEdit ?? true;

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [stylePreset, setStylePreset] = useState("drama_comedy");
  const [presets, setPresets] = useState<StylePresetMeta[]>([]);
  const [scriptMode, setScriptMode] = useState<"generate" | "upload">(
    "generate",
  );
  const [uploadText, setUploadText] = useState("");
  const [pending, startTransition] = useTransition();
  const [localStep, setLocalStep] = useState<WorkflowStep | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy("loading");
      setError(null);
      try {
        const [{ project: p, viewer: v }, { presets: list }] = await Promise.all([
          api.getProject(projectId),
          api.stylePresets(),
        ]);
        if (cancelled) return;
        setProject(p);
        setViewer(v);
        if (v.role === "reviewer") {
          setLocalStep(
            (p.currentStep as WorkflowStep) || "script",
          );
        }
        setTitle(p.title);
        setBrief(p.brief);
        setSellingPoints(p.sellingPoints);
        setStylePreset(p.stylePreset);
        setPresets(list);
        const latest = [...p.scripts].sort((a, b) => b.version - a.version)[0];
        if (latest?.source === "uploaded") {
          setScriptMode("upload");
          setUploadText(latest.content);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "加载失败";
          setError(
            msg.includes("Failed to fetch") || msg.includes("NetworkError")
              ? "无法连接后端，请确认已在本项目目录运行 npm run dev（端口 3002）"
              : msg,
          );
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, setBusy, setError, setProject, setViewer]);

  const step =
    viewer?.role === "reviewer" && localStep
      ? localStep
      : stepOf(project);
  const script = latestScript();
  const shots = latestShots();
  const loading = busy === "loading" && !project;

  function run(busyKey: string, fn: () => Promise<void>) {
    startTransition(async () => {
      setError(null);
      setBusy(busyKey);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      } finally {
        setBusy(null);
      }
    });
  }

  async function saveMeta() {
    const { project: p } = await api.updateProject(projectId, {
      title: title.trim(),
      brief: brief.trim(),
      sellingPoints: sellingPoints.trim(),
      stylePreset,
    });
    setProject(p);
  }

  function goToStep(next: WorkflowStep) {
    if (!canEdit) {
      setLocalStep(next);
      return;
    }
    run("step", async () => {
      const { project: p } = await api.updateProject(projectId, {
        currentStep: next,
      });
      setProject(p);
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <a
            href="/"
            className="text-xs tracking-[0.18em] text-ink/45 uppercase hover:text-accent"
          >
            Shotflow
          </a>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {title || "分镜工作台"}
          </h1>
          {viewer?.role === "reviewer" ? (
            <p className="mt-1 text-xs text-accent">
              审阅模式 · 可评论、可上传图 · 不能改脚本
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
        {viewer ? (
          <button
            type="button"
            className="text-xs text-ink/45 hover:text-accent"
            onClick={() =>
              void api.logout().then(() => {
                window.location.href = "/login";
              })
            }
          >
            {viewer.role === "reviewer" ? "退出审阅" : "退出登录"}
          </button>
        ) : null}
        <nav className="flex flex-wrap gap-1">
          {WORKFLOW_STEPS.map((s) => {
            const active = step === s.key;
            const reachable =
              s.key === "script" ||
              (s.key === "materials" && !!script) ||
              (s.key === "library" &&
                (!!project?.materialSuggestions.length || !!project?.assets.length || !!script)) ||
              (s.key === "storyboard" && !!script);
            return (
              <button
                key={s.key}
                type="button"
                disabled={!reachable || pending}
                className={`px-3 py-1.5 text-xs tracking-wide ${
                  active
                    ? "bg-ink text-paper"
                    : reachable
                      ? "text-ink/60 hover:bg-ink/5"
                      : "text-ink/25"
                }`}
                onClick={() => goToStep(s.key)}
              >
                {s.index}. {s.name}
              </button>
            );
          })}
        </nav>
        </div>
      </header>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-ink/45">加载项目…</p> : null}
      {!loading && canEdit ? <HistoryPanel /> : null}

      {!loading && step === "script" ? (
        <section className="flex flex-col gap-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-ink/50">项目信息</h2>
            <input
              className="rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="项目标题"
              value={title}
              disabled={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="min-h-[100px] rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="核心业务诉求"
              value={brief}
              disabled={!canEdit}
              onChange={(e) => setBrief(e.target.value)}
            />
            <textarea
              className="min-h-[80px] rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="产品卖点（可选）"
              value={sellingPoints}
              disabled={!canEdit}
              onChange={(e) => setSellingPoints(e.target.value)}
            />
            <select
              className="rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm"
              value={stylePreset}
              disabled={!canEdit}
              onChange={(e) => setStylePreset(e.target.value)}
            >
              {presets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-4">
            {canEdit ? (
              <>
            <div className="flex gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 text-sm ${
                  scriptMode === "generate" ? "bg-ink text-paper" : "text-ink/50"
                }`}
                onClick={() => setScriptMode("generate")}
              >
                生成脚本
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm ${
                  scriptMode === "upload" ? "bg-ink text-paper" : "text-ink/50"
                }`}
                onClick={() => setScriptMode("upload")}
              >
                上传现有脚本
              </button>
            </div>

            {scriptMode === "generate" ? (
              <>
                <p className="text-sm text-ink/55">
                  按风格预设，根据业务诉求生成剧情向短视频脚本（本步不含分镜）。
                </p>
                <button
                  type="button"
                  className="bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  disabled={pending || !brief.trim()}
                  onClick={() =>
                    run("generate-script", async () => {
                      await saveMeta();
                      const { project: p } = await api.generateScript(projectId);
                      setProject(p);
                    })
                  }
                >
                  {busy === "generate-script" ? "生成中…" : "生成脚本并进入下一步"}
                </button>
              </>
            ) : (
              <>
                <textarea
                  className="min-h-[220px] rounded-sm border border-ink/15 bg-white/80 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  placeholder="粘贴已有完整脚本…"
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                />
                <button
                  type="button"
                  className="bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  disabled={pending || !uploadText.trim()}
                  onClick={() =>
                    run("upload-script", async () => {
                      await saveMeta();
                      const { project: p } = await api.uploadScript(
                        projectId,
                        uploadText.trim(),
                      );
                      setProject(p);
                    })
                  }
                >
                  {busy === "upload-script" ? "保存中…" : "保存脚本并进入下一步"}
                </button>
              </>
            )}
              </>
            ) : null}

            {script ? (
              <details className="border-t border-ink/10 pt-4" open>
                <summary className="cursor-pointer text-sm text-ink/60">
                  当前脚本 v{script.version}（{script.source}）
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/75">
                  {script.content}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
        <CommentsPanel
          projectId={projectId}
          targetType="script"
          targetId={projectId}
        />
        </section>
      ) : null}

      {!loading && step === "materials" ? (
        <section className="flex max-w-3xl flex-col gap-6">
          <div>
            <h2 className="text-lg font-medium text-ink">素材建议</h2>
            <p className="mt-1 text-sm text-ink/55">
              根据脚本提炼生视频所需的参考图清单（人物 / 道具 / 场景 / 其他），再去资源库上传对应素材。
            </p>
          </div>
          {canEdit ? (
          <button
            type="button"
            className="w-fit bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending || !script}
            onClick={() =>
              run("suggest", async () => {
                const { project: p } = await api.suggestMaterials(projectId);
                setProject(p);
              })
            }
          >
            {busy === "suggest"
              ? "分析中…"
              : project?.materialSuggestions.length
                ? "重新生成素材建议"
                : "根据脚本生成素材建议"}
          </button>
          ) : null}

          {project?.materialSuggestions.length ? (
            <ul className="divide-y divide-ink/10 border-t border-ink/10">
              {project.materialSuggestions.map((s) => {
                const catName =
                  ASSET_CATEGORIES.find((c) => c.key === s.category)?.name ??
                  s.category;
                return (
                  <li key={s.id} className="flex gap-4 py-3">
                    <span className="w-14 shrink-0 font-mono text-xs text-accent">
                      {catName}
                    </span>
                    <div>
                      <p className="font-medium text-ink">{s.name}</p>
                      {s.description ? (
                        <p className="text-sm text-ink/55">{s.description}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {project?.materialSuggestions.length || script ? (
            <button
              type="button"
              className="w-fit border border-ink/20 px-4 py-2 text-sm"
              disabled={pending}
              onClick={() => goToStep("library")}
            >
              进入资源库上传 →
            </button>
          ) : null}
          <CommentsPanel
            projectId={projectId}
            targetType="materials"
            targetId={projectId}
          />
        </section>
      ) : null}

      {!loading && step === "library" ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-ink">资源库</h2>
              <p className="mt-1 text-sm text-ink/55">
                {canEdit
                  ? "按分类上传参考图；分类之间可拖拽调整。建议对照上一步素材清单补齐。"
                  : "可上传参考图（会标成审阅方上传）。不能改分类、不能删除已有素材。"}
              </p>
            </div>
            <button
              type="button"
              className="bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={pending || !script}
              onClick={() => goToStep("storyboard")}
            >
              进入分镜提示词 →
            </button>
          </div>

          {project?.materialSuggestions.length ? (
            <div className="border border-dashed border-ink/15 bg-white/40 px-4 py-3 text-sm text-ink/60">
              <span className="font-medium text-ink/80">清单提醒：</span>{" "}
              {project.materialSuggestions.map((s) => s.name).join(" · ")}
            </div>
          ) : null}

          <AssetLibrary projectId={projectId} assets={project?.assets ?? []} />
          <CommentsPanel
            projectId={projectId}
            targetType="library"
            targetId={projectId}
          />
        </section>
      ) : null}

      {!loading && step === "storyboard" ? (
        <section className="flex flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-ink">分镜生视频提示词</h2>
              <p className="mt-1 max-w-xl text-sm text-ink/55">
                文本框是发给豆包生视频的全文（角色、动作、镜头、对白、音效）。拖图到字后面标注图几。「重新生成分镜」会清空参考图。
              </p>
            </div>
            {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {shots.length ? (
                <button
                  type="button"
                  className="border border-accent/40 bg-white px-4 py-2.5 text-sm font-medium text-accent disabled:opacity-50"
                  disabled={pending || !script}
                  onClick={() =>
                    run("expand-prompts", async () => {
                      const { project: p } =
                        await api.expandStoryboardPrompts(projectId);
                      setProject(p);
                    })
                  }
                >
                  {busy === "expand-prompts"
                    ? "正在写生视频脚本…"
                    : "重写生视频脚本"}
                </button>
              ) : null}
              <button
                type="button"
                className="bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={pending || !script}
                onClick={() =>
                  run("storyboard", async () => {
                    const { project: p } =
                      await api.generateStoryboard(projectId);
                    setProject(p);
                  })
                }
              >
                {busy === "storyboard"
                  ? "切分中…"
                  : shots.length
                    ? "重新生成分镜"
                    : "根据脚本生成分镜"}
              </button>
            </div>
            ) : null}
          </div>

          {script ? (
            <details className="border-b border-ink/10 pb-4">
              <summary className="cursor-pointer text-sm text-ink/55">
                参考脚本 v{script.version}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink/70">
                {script.content}
              </pre>
            </details>
          ) : null}

          {shots.length === 0 ? (
            <div className="border border-dashed border-ink/20 px-6 py-16 text-center text-sm text-ink/45">
              {canEdit
                ? "点击上方按钮，将脚本切分为生视频分镜提示词"
                : "主账号还没有生成分镜提示词。"}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {canEdit ? (
              <LibraryTray
                assets={project?.assets ?? []}
                promptHint={
                  shots.find((s) => s.id === activeShotId)?.prompt ??
                  shots[0]?.prompt ??
                  ""
                }
                sceneHint={
                  shots.find((s) => s.id === activeShotId)?.sceneDesc ??
                  shots[0]?.sceneDesc ??
                  ""
                }
                dialogueHint={
                  shots.find((s) => s.id === activeShotId)?.dialogue ??
                  shots[0]?.dialogue ??
                  ""
                }
              />
              ) : null}
              {shots.map((shot) => (
                <ShotCard key={shot.id} shot={shot} />
              ))}
            </div>
          )}
          <CommentsPanel
            projectId={projectId}
            targetType="storyboard"
            targetId={projectId}
          />
        </section>
      ) : null}
    </div>
  );
}
