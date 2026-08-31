import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
};

type Ctx = { params: Promise<{ path: string[] }> };

/** 运行时上传的文件不在 next build 的 public 清单里，必须按磁盘读取 */
export async function GET(_req: Request, ctx: Ctx) {
  const { path: parts } = await ctx.params;
  if (!parts?.length || parts.some((p) => p.includes("..") || p.includes("/"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const root = path.join(process.cwd(), "public", "uploads");
  const abs = path.join(root, ...parts);
  if (!abs.startsWith(root)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const buf = await readFile(abs);
    const ext = (parts.at(-1)?.split(".").pop() || "").toLowerCase();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
