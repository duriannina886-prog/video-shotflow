import { jsonError, jsonOk } from "@/lib/api";
import {
  cookieOptions,
  OWNER_COOKIE,
  credentialsMatch,
  signOwnerCookie,
  ownerPasswordConfigured,
} from "@/lib/auth";

export async function POST(req: Request) {
  if (!ownerPasswordConfigured()) {
    return jsonError("未配置主账号，本地已默认登录");
  }
  const body = (await req.json().catch(() => null)) as {
    account?: string;
    password?: string;
  } | null;
  const account = body?.account?.trim() ?? "";
  const password = body?.password ?? "";
  if (!credentialsMatch(account, password)) {
    return jsonError("账号或密码不对", 401);
  }
  const res = jsonOk({ ok: true, role: "owner" });
  res.headers.append(
    "Set-Cookie",
    `${OWNER_COOKIE}=${signOwnerCookie()}; ${cookieOptions(60 * 60 * 24 * 30)}`,
  );
  return res;
}
