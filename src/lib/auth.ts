import { prisma } from "@/lib/db";
import {
  ownerPasswordConfigured,
  readOwnerSession,
  readReviewToken,
} from "@/lib/session-cookie";

export {
  OWNER_COOKIE,
  REVIEW_COOKIE,
  ownerPasswordConfigured,
  parseCookies,
  signOwnerCookie,
  signReviewCookie,
  readOwnerSession,
  readReviewToken,
  passwordMatches,
  credentialsMatch,
  newReviewToken,
  cookieOptions,
} from "@/lib/session-cookie";

export type Access =
  | { role: "owner" }
  | {
      role: "reviewer";
      reviewLinkId: string;
      token: string;
      name: string;
      projectIds: string[];
    }
  | { role: "none" };

export async function getAccess(req: Request): Promise<Access> {
  const cookieHeader = req.headers.get("cookie");
  if (readOwnerSession(cookieHeader)) return { role: "owner" };

  const token =
    readReviewToken(cookieHeader) ||
    req.headers.get("x-review-token")?.trim() ||
    null;
  if (token) {
    const link = await prisma.reviewLink.findUnique({
      where: { token },
      include: { projects: true },
    });
    if (link && !link.revokedAt) {
      return {
        role: "reviewer",
        reviewLinkId: link.id,
        token: link.token,
        name: link.name,
        projectIds: link.projects.map((p) => p.projectId),
      };
    }
  }

  // 未配置主账号密码时，本地仍以主账号运行，方便开发
  if (!ownerPasswordConfigured()) return { role: "owner" };
  return { role: "none" };
}

export function viewerFromAccess(access: Access, projectId?: string) {
  if (access.role === "owner") {
    return {
      role: "owner" as const,
      canEdit: true,
      canUploadAsset: true,
      canDeleteAsset: true,
      canUploadVideo: true,
      canResolveComment: true,
    };
  }
  if (
    access.role === "reviewer" &&
    (!projectId || access.projectIds.includes(projectId))
  ) {
    return {
      role: "reviewer" as const,
      canEdit: false,
      canUploadAsset: true,
      canDeleteAsset: false,
      canUploadVideo: false,
      canResolveComment: false,
    };
  }
  return null;
}
