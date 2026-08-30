import type { Prisma } from "@prisma/client";

export const projectDetailInclude = {
  scripts: {
    orderBy: { version: "desc" as const },
    include: {
      shots: {
        orderBy: { sequence: "asc" as const },
        include: {
          refs: {
            orderBy: { sortOrder: "asc" as const },
            include: { asset: true },
          },
          revisions: { orderBy: { createdAt: "desc" as const } },
          videos: { orderBy: { createdAt: "desc" as const } },
        },
      },
    },
  },
  materialSuggestions: {
    orderBy: [{ category: "asc" as const }, { sortOrder: "asc" as const }],
  },
  assets: {
    orderBy: [{ category: "asc" as const }, { sortOrder: "asc" as const }],
  },
} satisfies Prisma.ProjectInclude;

export type ProjectDetail = Prisma.ProjectGetPayload<{
  include: typeof projectDetailInclude;
}>;
