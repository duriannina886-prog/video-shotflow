"use client";

import { useRef } from "react";
import { ASSET_CATEGORIES } from "@/lib/categories";
import { startAssetDrag } from "@/lib/dnd";
import { displayName } from "@/lib/ref-annotate";
import { rankAssetsForShot, suggestedAssets } from "@/lib/rank-assets";
import type { Asset } from "@/lib/types";

type Props = {
  assets: Asset[];
  promptHint: string;
  sceneHint?: string;
  dialogueHint?: string;
};

export function LibraryTray({
  assets,
  promptHint,
  sceneHint = "",
  dialogueHint = "",
}: Props) {
  const ranked = rankAssetsForShot(assets, promptHint, sceneHint, dialogueHint);
  const suggested = suggestedAssets(
    assets,
    promptHint,
    sceneHint,
    dialogueHint,
    8,
  );
  const suggestedIds = new Set(suggested.map((a) => a.id));

  if (assets.length === 0) {
    return (
      <div className="border border-dashed border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink/50">
        资源库还是空的。可先到「资源库」分类上传，或直接从访达拖进提示词（会自动进库）。
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 border border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">资源库托盘</p>
        <p className="text-xs text-ink/45">
          拖到下方某镜提示词的字后面；高亮为当前镜头更可能用到的图
        </p>
      </div>
      {suggested.length > 0 ? (
        <p className="mb-2 text-[11px] tracking-wide text-accent">本镜建议</p>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {ranked.map((asset) => (
          <TrayThumb
            key={asset.id}
            asset={asset}
            suggested={suggestedIds.has(asset.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function TrayThumb({ asset, suggested }: { asset: Asset; suggested: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category)?.name;
  return (
    <li>
      <button
        type="button"
        draggable
        title={`${displayName(asset)} · ${cat ?? ""}`}
        className={`relative cursor-grab active:cursor-grabbing ${
          suggested ? "ring-2 ring-accent" : "ring-1 ring-ink/10"
        }`}
        onDragStart={(e) => startAssetDrag(e, asset.id, imgRef.current)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={asset.url}
          alt={displayName(asset)}
          className="h-14 w-14 object-cover"
        />
        {suggested ? (
          <span className="absolute left-0.5 top-0.5 bg-accent px-0.5 text-[9px] text-white">
            荐
          </span>
        ) : null}
        <span className="absolute bottom-0 left-0 right-0 truncate bg-ink/70 px-0.5 text-[9px] text-white">
          {displayName(asset)}
        </span>
      </button>
    </li>
  );
}
