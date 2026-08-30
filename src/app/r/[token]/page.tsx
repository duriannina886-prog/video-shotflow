"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

export default function ReviewEntryPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .openReview(token)
      .then(({ projectIds }) => {
        if (cancelled) return;
        if (projectIds.length === 1 && projectIds[0]) {
          router.replace(`/projects/${projectIds[0]}`);
          return;
        }
        router.replace("/");
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "链接无效");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-3 px-5 py-16">
      <p className="font-mono text-xs tracking-[0.28em] text-accent uppercase">
        Shotflow
      </p>
      {error ? (
        <>
          <h1 className="text-2xl font-semibold text-ink">无法打开审阅</h1>
          <p className="text-sm text-red-700">{error}</p>
          <a href="/" className="text-sm text-accent">
            回到首页
          </a>
        </>
      ) : (
        <p className="text-sm text-ink/55">正在打开审阅…</p>
      )}
    </main>
  );
}
