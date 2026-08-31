"use client";

import { useEffect, useState, useTransition } from "react";
import { api } from "@/lib/client-api";
import type { Shot } from "@/lib/types";
import {
  MAX_SHOT_REFS,
  insertFigureMarkAt,
  removeFigureMarkAndRenumber,
  toFigureName,
  validatePromptFigures,
} from "@/lib/ref-annotate";
import { PromptDropField } from "@/components/prompt-drop-field";
import { ShotVideos } from "@/components/shot-videos";
import { CommentsPanel } from "@/components/comments-panel";
import { useWorkbench } from "@/store/workbench";

type Props = { shot: Shot };

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isImageFile(file: File) {
  if (IMAGE_TYPES.has(file.type)) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

export function ShotCard({ shot }: Props) {
  const patchShot = useWorkbench((s) => s.patchShot);
  const upsertAsset = useWorkbench((s) => s.upsertAsset);
  const project = useWorkbench((s) => s.project);
  const [feedback, setFeedback] = useState("");
  const [promptDraft, setPromptDraft] = useState(shot.prompt);
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [promptDropOver, setPromptDropOver] = useState(false);
  const setActiveShotId = useWorkbench((s) => s.setActiveShotId);
  const viewer = useWorkbench((s) => s.viewer);
  const canEdit = viewer?.canEdit ?? true;
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [pluginReady, setPluginReady] = useState(false);

  useEffect(() => {
    setPromptDraft(shot.prompt);
  }, [shot.prompt]);

  useEffect(() => {
    const sync = () =>
      setPluginReady(document.documentElement.dataset.shotflowPlugin === "ready");
    sync();
    window.addEventListener("shotflow:plugin-ready", sync);
    return () => window.removeEventListener("shotflow:plugin-ready", sync);
  }, []);

  const imageUrls = shot.refs.map((r) => r.asset.url);
  const dataImages = JSON.stringify(imageUrls);
  const figureCheck = validatePromptFigures(promptDraft, shot.refs.length);
  const atLimit = shot.refs.length >= MAX_SHOT_REFS;

  function run(label: string, fn: () => Promise<void>) {
    setLocalError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : label);
      }
    });
  }

  function applyShot(next: Shot) {
    patchShot(shot.id, next);
    setPromptDraft(next.prompt);
  }

  /** 在提示词某位置拖入图片：加入本镜末尾，并在该处写入（图N） */
  function attachAtPromptPosition(files: File[], charIndex: number) {
    if (!canEdit) return;
    if (!project) {
      setLocalError("项目未加载");
      return;
    }
    const images = files.filter(isImageFile);
    if (!images.length) {
      setLocalError("请拖入 jpeg / png / webp / gif");
      return;
    }
    if (atLimit) {
      setLocalError(`本镜最多 ${MAX_SHOT_REFS} 张参考图`);
      return;
    }

    const room = MAX_SHOT_REFS - shot.refs.length;
    const batch = images.slice(0, room);

    run("添加参考图失败", async () => {
      let prompt = promptDraft;
      let insertAt = charIndex;
      const ids = shot.refs.map((r) => r.assetId);

      for (const file of batch) {
        const { asset } = await api.uploadLibraryAsset(
          project.id,
          file,
          "other",
        );
        upsertAsset(asset);
        if (ids.includes(asset.id)) continue;

        const figureIndex0 = ids.length;
        prompt = insertFigureMarkAt(prompt, insertAt, figureIndex0);
        // 下一张图插在本图注之后，避免叠在同一位置
        insertAt += `（${toFigureName(figureIndex0)}）`.length;
        ids.push(asset.id);
      }

      const { shot: next } = await api.setShotRefs(shot.id, ids, {
        reannotate: false,
        prompt,
      });
      applyShot(next);
    });
  }

  function attachLibraryAsset(assetId: string, charIndex: number) {
    if (!canEdit) return;
    if (atLimit) {
      setLocalError(`本镜最多 ${MAX_SHOT_REFS} 张参考图`);
      return;
    }
    const ids = shot.refs.map((r) => r.assetId);
    if (ids.includes(assetId)) {
      setLocalError("这张图已在本镜中，可拖拽缩略图调序");
      return;
    }
    run("添加参考图失败", async () => {
      const figureIndex0 = ids.length;
      const prompt = insertFigureMarkAt(promptDraft, charIndex, figureIndex0);
      const { shot: next } = await api.setShotRefs(
        shot.id,
        [...ids, assetId],
        { reannotate: false, prompt },
      );
      applyShot(next);
    });
  }

  function reorder(from: number, to: number) {
    if (!canEdit) return;
    if (from === to || from < 0 || to < 0) return;
    const ids = shot.refs.map((r) => r.assetId);
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    // 图几 = 列表下标；文案里的「图N」含义随列表变，不必改正文
    run("调整顺序失败", async () => {
      const { shot: next } = await api.setShotRefs(shot.id, ids, {
        reannotate: false,
        prompt: promptDraft,
      });
      applyShot(next);
    });
  }

  function removeRef(idx: number) {
    const ids = shot.refs
      .filter((_, i) => i !== idx)
      .map((r) => r.assetId);
    const nextPrompt = removeFigureMarkAndRenumber(promptDraft, idx);
    run("移除失败", async () => {
      const { shot: next } = await api.setShotRefs(shot.id, ids, {
        reannotate: false,
        prompt: nextPrompt,
      });
      applyShot(next);
    });
  }

  return (
    <article
      className="shot-card flex flex-col gap-4 border-t border-ink/10 pt-6"
      data-shot-id={shot.id}
      data-sequence={shot.sequence}
      onMouseEnter={() => setActiveShotId(shot.id)}
      onFocusCapture={() => setActiveShotId(shot.id)}
      onDragEnter={(e) => {
        const types = Array.from(e.dataTransfer.types);
        if (types.includes("Files") || types.includes("text/shotflow-asset-id")) {
          setPromptDropOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setPromptDropOver(false);
        }
      }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs tracking-[0.2em] text-accent">
            {String(shot.sequence).padStart(2, "0")}
          </span>
          <h3 className="text-lg font-medium text-ink">
            {shot.title || `分镜 ${shot.sequence}`}
          </h3>
        </div>
        {shot.durationHint ? (
          <span className="font-mono text-xs text-ink/45">{shot.durationHint}</span>
        ) : null}
      </header>

      <p className="text-[15px] leading-relaxed text-ink/80">{shot.sceneDesc}</p>

      {shot.dialogue ? (
        <p className="border-l-2 border-accent/40 pl-3 text-sm italic text-ink/60">
          “{shot.dialogue}”
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium tracking-wide text-ink/50">
          生视频提示词（画面+对白，将连同参考图一并发送）
        </span>
        <PromptDropField
          value={promptDraft}
          disabled={pending || !canEdit}
          dropOver={promptDropOver}
          placeholder="把参考图拖到某个词后面（如「年轻主角」后），自动写成（图一）"
          onChange={setPromptDraft}
          onBlurSave={() => {
            if (!canEdit) return;
            if (promptDraft.trim() === shot.prompt) return;
            run("保存失败", async () => {
              const { shot: next } = await api.updateShot(shot.id, {
                prompt: promptDraft.trim(),
              });
              applyShot(next);
            });
          }}
          onDropOverChange={setPromptDropOver}
          onDropFiles={(files, charIndex) =>
            attachAtPromptPosition(files, charIndex)
          }
          onDropAsset={(assetId, charIndex) =>
            attachLibraryAsset(assetId, charIndex)
          }
        />
        <p className="pointer-events-none select-none text-xs text-ink/40">
          {promptDropOver
            ? "对准文本框里的字再松开，绿线就是插入位置"
            : `拖到提示词框内任意字后面松开即可插入（图一）（图二）…（本镜 ${shot.refs.length}/${MAX_SHOT_REFS}）`}
        </p>
        {!figureCheck.ok ? (
          <p className="text-xs text-amber-800">{figureCheck.message}</p>
        ) : null}
      </label>

      {shot.refs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-ink/50">
            本镜参考图（顺序=图一…{canEdit ? "，可拖拽调序" : ""}）
          </span>
          <ul className="flex flex-wrap gap-2">
            {shot.refs.map((ref, idx) => (
              <li
                key={ref.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  if (!canEdit) return;
                  e.dataTransfer.setData("text/ref-index", String(idx));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverIdx(idx);
                }}
                onDragLeave={() =>
                  setDragOverIdx((d) => (d === idx ? null : d))
                }
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverIdx(null);
                  if (e.dataTransfer.files?.length) return;
                  const from = Number(
                    e.dataTransfer.getData("text/ref-index"),
                  );
                  if (Number.isFinite(from)) reorder(from, idx);
                }}
                className={`group relative ${
                  canEdit ? "cursor-grab active:cursor-grabbing" : ""
                } ${dragOverIdx === idx ? "ring-2 ring-accent" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ref.asset.url}
                  alt={ref.asset.label ?? "参考图"}
                  className="h-20 w-20 object-cover ring-1 ring-ink/10"
                />
                <span className="absolute left-0.5 top-0.5 bg-accent px-1 text-[10px] font-medium text-white">
                  {toFigureName(idx)}
                </span>
                {canEdit ? (
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 hidden bg-ink/80 px-1 text-[10px] text-white group-hover:block"
                  disabled={pending}
                  onClick={() => removeRef(idx)}
                >
                  ×
                </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ShotVideos shot={{ ...shot, prompt: promptDraft }} />

      {project ? (
        <CommentsPanel
          projectId={project.id}
          targetType="shot"
          targetId={shot.id}
          shotId={shot.id}
        />
      ) : null}

      {canEdit ? (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium tracking-wide text-ink/50">
          优化反馈（对生成视频不满意时）
        </span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-sm border border-ink/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="例如：光线太暗、角色偏老、镜头太远…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
            disabled={pending || !feedback.trim()}
            onClick={() =>
              run("优化失败", async () => {
                const { shot: next } = await api.optimizeShot(
                  shot.id,
                  feedback.trim(),
                );
                applyShot(next);
                setFeedback("");
              })
            }
          >
            优化提示词
          </button>
        </div>
      </label>
      ) : null}

      {canEdit ? (
      <div className="mt-1 flex flex-col gap-1">
      <button
        type="button"
        className="send-to-plugin w-full border border-dashed border-accent/50 bg-accent/5 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
        data-prompt={promptDraft}
        data-images={dataImages}
        data-shot-id={shot.id}
        data-sequence={String(shot.sequence)}
        disabled={pending || !figureCheck.ok}
        onClick={() => {
          const check = validatePromptFigures(promptDraft, shot.refs.length);
          if (!check.ok) {
            setLocalError(check.message);
            return;
          }
          if (document.documentElement.dataset.shotflowPlugin !== "ready") {
            setLocalError(
              "未检测到 Chrome 插件。打开 chrome://extensions → 打开开发者模式 → 加载已解压的扩展程序 → 选本仓库 extension 文件夹。加载后刷新本页。",
            );
          }
        }}
      >
        一键发送到豆包
      </button>
      <p className="text-[11px] leading-relaxed text-ink/40">
        {pluginReady
          ? "插件已连接。会打开豆包生视频页并填入本镜提示词与参考图（需已登录豆包）。"
          : "请先安装仓库里的 Chrome 插件 extension/，否则只会提示安装步骤。"}
      </p>
      </div>
      ) : null}

      {localError ? <p className="text-sm text-red-700">{localError}</p> : null}
    </article>
  );
}
