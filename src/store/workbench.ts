"use client";

import { create } from "zustand";
import type { Asset, Project, Shot, Viewer } from "@/lib/types";
import type { WorkflowStep } from "@/lib/categories";

type WorkbenchState = {
  project: Project | null;
  viewer: Viewer | null;
  busy: string | null;
  error: string | null;
  setViewer: (viewer: Viewer | null) => void;
  setProject: (project: Project | null) => void;
  setBusy: (busy: string | null) => void;
  setError: (error: string | null) => void;
  patchShot: (shotId: string, shot: Shot) => void;
  upsertAsset: (asset: Asset) => void;
  removeAsset: (assetId: string) => void;
  activeShotId: string | null;
  setActiveShotId: (id: string | null) => void;
  latestScript: () => Project["scripts"][number] | null;
  latestShots: () => Shot[];
};

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  project: null,
  viewer: null,
  busy: null,
  error: null,
  activeShotId: null,
  setActiveShotId: (id) => set({ activeShotId: id }),
  setViewer: (viewer) => set({ viewer }),
  setProject: (project) => set({ project, error: null }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  patchShot: (shotId, shot) => {
    const project = get().project;
    if (!project) return;
    set({
      project: {
        ...project,
        scripts: project.scripts.map((script) => ({
          ...script,
          shots: script.shots.map((s) => (s.id === shotId ? shot : s)),
        })),
      },
    });
  },
  upsertAsset: (asset) => {
    const project = get().project;
    if (!project) return;
    const exists = project.assets.some((a) => a.id === asset.id);
    set({
      project: {
        ...project,
        assets: exists
          ? project.assets.map((a) => (a.id === asset.id ? asset : a))
          : [...project.assets, asset],
      },
    });
  },
  removeAsset: (assetId) => {
    const project = get().project;
    if (!project) return;
    set({
      project: {
        ...project,
        assets: project.assets.filter((a) => a.id !== assetId),
        scripts: project.scripts.map((script) => ({
          ...script,
          shots: script.shots.map((shot) => ({
            ...shot,
            refs: shot.refs.filter((r) => r.assetId !== assetId),
          })),
        })),
      },
    });
  },
  latestScript: () => {
    const scripts = get().project?.scripts ?? [];
    if (!scripts.length) return null;
    return [...scripts].sort((a, b) => b.version - a.version)[0] ?? null;
  },
  latestShots: () => get().latestScript()?.shots ?? [],
}));

export function stepOf(project: Project | null): WorkflowStep {
  const s = project?.currentStep;
  if (
    s === "script" ||
    s === "materials" ||
    s === "library" ||
    s === "storyboard"
  ) {
    return s;
  }
  return "script";
}
