"use client";

import { useEffect, useState } from "react";
import type { ProjectListItem, ReviewLink } from "@/lib/types";
import { api } from "@/lib/client-api";

export function ReviewLinksPanel({ projects }: { projects: ProjectListItem[] }) {
  const [links, setLinks] = useState<ReviewLink[]>([]);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api
      .listReviewLinks()
      .then((r) => setLinks(r.links))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  function toggle(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  async function create() {
    setError(null);
    try {
      const { link } = await api.createReviewLink({
        name: name.trim() || "业务审阅",
        projectIds: picked,
      });
      setLinks((cur) => [link, ...cur]);
      setName("");
      setPicked([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    }
  }

  async function revoke(id: string) {
    try {
      const { link } = await api.patchReviewLink(id, { revoke: true });
      setLinks((cur) => cur.map((l) => (l.id === id ? { ...l, ...link } : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "作废失败");
    }
  }

  return (
    <section className="mt-12 border-t border-ink/10 pt-8">
      <h2 className="text-sm font-medium tracking-wide text-ink/50">
        审阅链接
      </h2>
      <p className="mt-1 text-sm text-ink/55">
        发给业务线，免登录即可看被勾选的脚本项目、评论、上传参考图。不能改脚本、不能删素材。
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <input
          className="max-w-sm rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          placeholder="链接备注，如：别克业务线"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ul className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-1.5 border border-ink/15 bg-white/70 px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                {p.title}
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="w-fit bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={!picked.length}
          onClick={() => void create()}
        >
          生成审阅链接
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-5 divide-y divide-ink/10 border-t border-ink/10">
        {links.map((l) => (
          <li key={l.id} className="flex flex-col gap-1 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{l.name}</span>
              <span className="font-mono text-[11px] text-ink/40">
                {l.revokedAt ? "已作废" : "有效"}
              </span>
            </div>
            {l.url ? (
              <p className="break-all font-mono text-xs text-ink/55">{l.url}</p>
            ) : null}
            <p className="text-xs text-ink/45">
              {l.projectIds.length} 个脚本
            </p>
            <div className="flex gap-3 text-xs">
              {l.url && !l.revokedAt ? (
                <button
                  type="button"
                  className="text-accent"
                  onClick={() => {
                    void navigator.clipboard.writeText(l.url!);
                    setCopied(l.id);
                  }}
                >
                  {copied === l.id ? "已复制" : "复制链接"}
                </button>
              ) : null}
              {!l.revokedAt ? (
                <button
                  type="button"
                  className="text-ink/50"
                  onClick={() => void revoke(l.id)}
                >
                  作废
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
