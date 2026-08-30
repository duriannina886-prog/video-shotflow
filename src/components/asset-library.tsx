"use client";

import { useRef, useState, useTransition } from "react";
import { ASSET_CATEGORIES, type AssetCategory } from "@/lib/categories";
import { api } from "@/lib/client-api";
import type { Asset } from "@/lib/types";
import { useWorkbench } from "@/store/workbench";

type Props = { projectId: string; assets: Asset[] };

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isImageFile(file: File) {
  if (IMAGE_TYPES.has(file.type)) return true;
  // 部分系统拖拽时 type 为空，按扩展名兜底
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

function filesFromDataTransfer(dt: DataTransfer): File[] {
  const fromItems: File[] = [];
  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) fromItems.push(f);
      }
    }
  }
  const list = fromItems.length ? fromItems : Array.from(dt.files ?? []);
  return list.filter(isImageFile);
}

export function AssetLibrary({ projectId, assets }: Props) {
  const upsertAsset = useWorkbench((s) => s.upsertAsset);
  const removeAsset = useWorkbench((s) => s.removeAsset);
  const viewer = useWorkbench((s) => s.viewer);
  const canDelete = viewer?.canDeleteAsset ?? true;
  const canRecategorize = viewer?.canEdit ?? true;
  const [uploadCategory, setUploadCategory] =
    useState<AssetCategory>("character");
  const [dragOver, setDragOver] = useState<AssetCategory | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });
  }

  function uploadFiles(category: AssetCategory, files: File[]) {
    if (!files.length) {
      setError("请拖入 jpeg / png / webp / gif 图片");
      return;
    }
    run(async () => {
      for (const file of files) {
        const { asset } = await api.uploadLibraryAsset(
          projectId,
          file,
          category,
        );
        upsertAsset(asset);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">按钮上传到分类</span>
          <select
            className="rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm"
            value={uploadCategory}
            onChange={(e) =>
              setUploadCategory(e.target.value as AssetCategory)
            }
          >
            {ASSET_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          上传图片素材
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            uploadFiles(uploadCategory, files.filter(isImageFile));
          }}
        />
        <p className="text-xs text-ink/40">
          {canRecategorize
            ? "也可直接把本地图片拖进下方分类块；库内图片可拖到其他分类改类"
            : "把本地图片拖进下方分类块即可上传，会标成审阅方上传"}
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {pending ? (
        <p className="text-sm text-ink/45">上传中…</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {ASSET_CATEGORIES.map((cat) => {
          const items = assets.filter((a) => a.category === cat.key);
          const active = dragOver === cat.key;
          return (
            <section
              key={cat.key}
              className={`min-h-[180px] border border-dashed p-3 transition ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-ink/20 bg-white/50"
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(cat.key);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
                  "Files",
                )
                  ? "copy"
                  : "move";
                setDragOver(cat.key);
              }}
              onDragLeave={(e) => {
                // 离开整个区块时才取消高亮（避免子元素触发闪烁）
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOver((d) => (d === cat.key ? null : d));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);

                // 1) 本地文件拖入 → 上传到该分类
                const files = filesFromDataTransfer(e.dataTransfer);
                if (files.length) {
                  uploadFiles(cat.key, files);
                  return;
                }

                // 2) 库内素材换分类（审阅方不能改类）
                const assetId = e.dataTransfer.getData("text/asset-id");
                if (!assetId || !canRecategorize) return;
                const asset = assets.find((a) => a.id === assetId);
                if (!asset || asset.category === cat.key) return;
                run(async () => {
                  const { asset: next } = await api.updateAsset(assetId, {
                    category: cat.key,
                  });
                  upsertAsset(next);
                });
              }}
            >
              <header className="mb-3 flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-ink">{cat.name}</h3>
                <span className="font-mono text-[11px] text-ink/40">
                  {items.length}
                </span>
              </header>
              {items.length === 0 ? (
                <p
                  className={`flex min-h-[120px] items-center justify-center text-center text-xs ${
                    active ? "text-accent" : "text-ink/35"
                  }`}
                >
                  {active
                    ? "松开鼠标，上传到此分类"
                    : "将本地图片拖到这里，或点上方按钮上传"}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {items.map((asset) => (
                    <li
                      key={asset.id}
                      draggable={canRecategorize}
                      onDragStart={(e) => {
                        if (!canRecategorize) return;
                        e.dataTransfer.setData("text/asset-id", asset.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={`group relative ${
                        canRecategorize
                          ? "cursor-grab active:cursor-grabbing"
                          : ""
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.label ?? ""}
                        className="h-20 w-20 object-cover ring-1 ring-ink/10"
                      />
                      <span className="absolute bottom-0 left-0 right-0 truncate bg-ink/65 px-0.5 text-[9px] text-white">
                        {asset.label || "未命名"}
                        {asset.source === "reviewer" ? " · 审阅" : ""}
                      </span>
                      {canDelete ? (
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 hidden bg-ink/80 px-1 text-[10px] text-white group-hover:block"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            await api.deleteAsset(asset.id);
                            removeAsset(asset.id);
                          })
                        }
                      >
                        ×
                      </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
