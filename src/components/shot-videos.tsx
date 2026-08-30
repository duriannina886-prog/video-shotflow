"use client";

import { useState } from "react";
import type { Shot, ShotVideo } from "@/lib/types";
import { api } from "@/lib/client-api";
import { useWorkbench } from "@/store/workbench";

type Props = { shot: Shot };

export function ShotVideos({ shot }: Props) {
  const viewer = useWorkbench((s) => s.viewer);
  const patchShot = useWorkbench((s) => s.patchShot);
  const [note, setNote] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videos = shot.videos ?? [];

  function toggle(id: string) {
    setCompare((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= 2
          ? [cur[1]!, id]
          : [...cur, id],
    );
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { video } = await api.uploadShotVideo(shot.id, file, note.trim());
      patchShot(shot.id, { ...shot, videos: [video, ...videos] });
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  const selected = videos.filter((v) => compare.includes(v.id));

  return (
    <section className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-ink/50">
        镜头视频回传（可多版本对比）
      </span>
      {viewer?.canUploadVideo ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-sm border border-ink/15 bg-white/70 px-3 py-1.5 text-sm"
            placeholder="版本备注，如：第二轮、改了光线"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="cursor-pointer bg-ink px-3 py-1.5 text-sm text-paper">
            {busy ? "上传中…" : "回传成片"}
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {videos.length === 0 ? (
        <p className="text-xs text-ink/40">还没有回传视频。主账号从豆包下载后传到这里。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {videos.map((v, i) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-3 border border-ink/10 bg-white/50 px-2 py-2"
            >
              <label className="flex items-center gap-1 text-xs text-ink/55">
                <input
                  type="checkbox"
                  checked={compare.includes(v.id)}
                  onChange={() => toggle(v.id)}
                />
                对比
              </label>
              <span className="font-mono text-[11px] text-accent">
                v{videos.length - i}
              </span>
              <span className="text-xs text-ink/50">
                {new Date(v.createdAt).toLocaleString("zh-CN")}
                {v.note ? ` · ${v.note}` : ""}
              </span>
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent"
              >
                打开
              </a>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 ? (
        <div
          className={`grid gap-2 ${selected.length > 1 ? "sm:grid-cols-2" : ""}`}
        >
          {selected.map((v) => (
            <VideoPlayer key={v.id} video={v} />
          ))}
        </div>
      ) : videos[0] ? (
        <VideoPlayer video={videos[0]} />
      ) : null}
    </section>
  );
}

function VideoPlayer({ video }: { video: ShotVideo }) {
  return (
    <figure className="flex flex-col gap-1">
      <video
        src={video.url}
        controls
        className="w-full max-h-72 bg-ink/90"
      />
      <figcaption className="text-[11px] text-ink/45">
        {video.note || video.filename || "成片"}
      </figcaption>
    </figure>
  );
}
