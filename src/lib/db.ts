import path from "path";
import { PrismaClient } from "@prisma/client";

// Next 运行时与 Prisma CLI 的 SQLite 相对路径基准不一致，统一指向项目内 prisma/dev.db
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL === "file:./dev.db" ||
  process.env.DATABASE_URL === "file:./prisma/dev.db"
) {
  process.env.DATABASE_URL = `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
