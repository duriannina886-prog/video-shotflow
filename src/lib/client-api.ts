import type {
  Asset,
  Comment,
  Project,
  ProjectListItem,
  ReviewLink,
  Shot,
  ShotVideo,
  StylePresetMeta,
  Viewer,
} from "@/lib/types";

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `请求失败 (${res.status})`);
  }
  return data;
}

export const api = {
  listProjects: () =>
    fetch("/api/projects").then((r) =>
      parseJson<{ projects: ProjectListItem[]; role: "owner" | "reviewer" }>(r),
    ),

  createProject: (body: {
    title: string;
    brief: string;
    sellingPoints?: string;
    stylePreset?: string;
  }) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ project: Project }>(r)),

  getProject: (id: string) =>
    fetch(`/api/projects/${id}`).then((r) =>
      parseJson<{ project: Project; viewer: Viewer }>(r),
    ),

  updateProject: (
    id: string,
    body: Partial<{
      title: string;
      brief: string;
      sellingPoints: string;
      stylePreset: string;
      status: string;
      currentStep: "script" | "materials" | "library" | "storyboard";
    }>,
  ) =>
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ project: Project }>(r)),

  generateScript: (id: string) =>
    fetch(`/api/projects/${id}/script/generate`, { method: "POST" }).then((r) =>
      parseJson<{ project: Project }>(r),
    ),

  uploadScript: (id: string, content: string) =>
    fetch(`/api/projects/${id}/script/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }).then((r) => parseJson<{ project: Project }>(r)),

  suggestMaterials: (id: string) =>
    fetch(`/api/projects/${id}/materials/suggest`, { method: "POST" }).then(
      (r) => parseJson<{ project: Project }>(r),
    ),

  uploadLibraryAsset: (
    projectId: string,
    file: File,
    category: string,
    label?: string,
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    if (label) form.append("label", label);
    return fetch(`/api/projects/${projectId}/assets`, {
      method: "POST",
      body: form,
    }).then((r) => parseJson<{ asset: Asset }>(r));
  },

  updateAsset: (
    id: string,
    body: Partial<{ category: string; label: string | null; sortOrder: number }>,
  ) =>
    fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ asset: Asset }>(r)),

  deleteAsset: (id: string) =>
    fetch(`/api/assets/${id}`, { method: "DELETE" }).then((r) =>
      parseJson<{ ok: boolean }>(r),
    ),

  generateStoryboard: (id: string) =>
    fetch(`/api/projects/${id}/storyboard/generate`, { method: "POST" }).then(
      (r) => parseJson<{ project: Project }>(r),
    ),

  expandStoryboardPrompts: (id: string) =>
    fetch(`/api/projects/${id}/storyboard/expand`, { method: "POST" }).then(
      (r) => parseJson<{ project: Project }>(r),
    ),

  updateShot: (
    id: string,
    body: Partial<{
      title: string | null;
      sceneDesc: string;
      prompt: string;
      dialogue: string | null;
      durationHint: string | null;
    }>,
  ) =>
    fetch(`/api/shots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ shot: Shot }>(r)),

  optimizeShot: (id: string, feedback: string) =>
    fetch(`/api/shots/${id}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    }).then((r) => parseJson<{ shot: Shot }>(r)),

  setShotRefs: (
    id: string,
    assetIds: string[],
    opts?: { reannotate?: boolean; prompt?: string },
  ) =>
    fetch(`/api/shots/${id}/refs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetIds,
        reannotate: opts?.reannotate ?? true,
        prompt: opts?.prompt,
      }),
    }).then((r) => parseJson<{ shot: Shot }>(r)),

  reannotateShot: (id: string) =>
    fetch(`/api/shots/${id}/reannotate`, { method: "POST" }).then((r) =>
      parseJson<{ shot: Shot }>(r),
    ),

  stylePresets: () =>
    fetch("/api/style-presets").then((r) =>
      parseJson<{ presets: StylePresetMeta[] }>(r),
    ),

  login: (account: string, password: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
    }).then((r) => parseJson<{ ok: boolean }>(r)),

  logout: () =>
    fetch("/api/auth/logout", { method: "POST" }).then((r) =>
      parseJson<{ ok: boolean }>(r),
    ),

  me: () =>
    fetch("/api/auth/me").then((r) =>
      parseJson<{
        role: "none" | "owner" | "reviewer";
        name?: string;
        projectIds?: string[];
        viewer: Viewer | null;
      }>(r),
    ),

  openReview: (token: string) =>
    fetch(`/api/review/${token}`).then((r) =>
      parseJson<{ name: string; projectIds: string[] }>(r),
    ),

  listReviewLinks: () =>
    fetch("/api/review-links").then((r) =>
      parseJson<{ links: ReviewLink[] }>(r),
    ),

  createReviewLink: (body: { name: string; projectIds: string[] }) =>
    fetch("/api/review-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ link: ReviewLink }>(r)),

  patchReviewLink: (
    id: string,
    body: { name?: string; projectIds?: string[]; revoke?: boolean },
  ) =>
    fetch(`/api/review-links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ link: ReviewLink }>(r)),

  listComments: (projectId: string, targetType: string, targetId: string) =>
    fetch(
      `/api/projects/${projectId}/comments?targetType=${targetType}&targetId=${targetId}`,
    ).then((r) => parseJson<{ comments: Comment[] }>(r)),

  createComment: (
    projectId: string,
    body: {
      targetType: string;
      targetId: string;
      shotId?: string;
      parentId?: string;
      body: string;
      authorLabel?: string;
    },
  ) =>
    fetch(`/api/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ comment: Comment }>(r)),

  patchComment: (
    projectId: string,
    body: { id: string; status?: "pending" | "resolved"; body?: string },
  ) =>
    fetch(`/api/projects/${projectId}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ comment: Comment }>(r)),

  uploadShotVideo: (shotId: string, file: File, note?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (note) form.append("note", note);
    return fetch(`/api/shots/${shotId}/videos`, {
      method: "POST",
      body: form,
    }).then((r) => parseJson<{ video: ShotVideo }>(r));
  },
};
