import { jsonOk } from "@/lib/api";
import { cookieOptions, OWNER_COOKIE, REVIEW_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = jsonOk({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${OWNER_COOKIE}=; ${cookieOptions(0)}`,
  );
  res.headers.append(
    "Set-Cookie",
    `${REVIEW_COOKIE}=; ${cookieOptions(0)}`,
  );
  return res;
}
