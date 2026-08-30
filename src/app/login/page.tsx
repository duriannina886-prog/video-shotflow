"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/client-api";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const from = search.get("from") || "/";
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        if (me.role === "owner" || me.role === "reviewer") {
          router.replace(from.startsWith("/") ? from : "/");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [from, router]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-16">
      <div>
        <p className="font-mono text-xs tracking-[0.28em] text-accent uppercase">
          Shotflow
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          主账号登录
        </h1>
        <p className="mt-2 text-sm text-ink/55">
          工作台和写脚本接口需要登录。业务审阅请走发给你的链接，不必在这里登录。
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void api
            .login(account.trim(), password)
            .then(() => {
              router.replace(from.startsWith("/") ? from : "/");
            })
            .catch((err) => {
              setError(err instanceof Error ? err.message : "登录失败");
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">账号</span>
          <input
            type="text"
            inputMode="tel"
            autoComplete="username"
            required
            className="rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="主账号"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">密码</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            className="rounded-sm border border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !account.trim() || !password}
          className="bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "登录中…" : "进入"}
        </button>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="px-5 py-16 text-sm text-ink/45">加载登录页…</main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
