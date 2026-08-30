export type AssetCategory = "character" | "prop" | "scene" | "other";

export type Asset = {
  id: string;
  projectId: string;
  category: string;
  label: string | null;
  url: string;
  filename: string | null;
  mimeType: string | null;
  sortOrder: number;
  source: string;
  reviewLinkId: string | null;
  createdAt: string;
};

export type ShotVideo = {
  id: string;
  shotId: string;
  url: string;
  filename: string | null;
  mimeType: string | null;
  note: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  projectId: string;
  targetType: string;
  targetId: string;
  shotId: string | null;
  parentId: string | null;
  body: string;
  status: string;
  authorRole: string;
  authorLabel: string;
  reviewLinkId: string | null;
  createdAt: string;
  updatedAt: string;
  replies: Comment[];
};

export type Viewer = {
  role: "owner" | "reviewer";
  canEdit: boolean;
  canUploadAsset: boolean;
  canDeleteAsset: boolean;
  canUploadVideo: boolean;
  canResolveComment: boolean;
};

export type ReviewLink = {
  id: string;
  token: string;
  name: string;
  revokedAt: string | null;
  createdAt: string;
  projectIds: string[];
  url?: string;
};

export type MaterialSuggestion = {
  id: string;
  projectId: string;
  category: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
};

export type PromptRevision = {
  id: string;
  shotId: string;
  prompt: string;
  feedback: string | null;
  createdAt: string;
};

export type ShotAssetRef = {
  id: string;
  shotId: string;
  assetId: string;
  sortOrder: number;
  asset: Asset;
};

export type Shot = {
  id: string;
  scriptId: string;
  sequence: number;
  title: string | null;
  sceneDesc: string;
  prompt: string;
  dialogue: string | null;
  durationHint: string | null;
  refHints: string;
  createdAt: string;
  updatedAt: string;
  refs: ShotAssetRef[];
  revisions: PromptRevision[];
  videos: ShotVideo[];
};

export type Script = {
  id: string;
  projectId: string;
  content: string;
  source: string;
  version: number;
  createdAt: string;
  shots: Shot[];
};

export type Project = {
  id: string;
  title: string;
  brief: string;
  sellingPoints: string;
  stylePreset: string;
  status: string;
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  scripts: Script[];
  materialSuggestions: MaterialSuggestion[];
  assets: Asset[];
};

export type ProjectListItem = {
  id: string;
  title: string;
  brief: string;
  sellingPoints: string;
  stylePreset: string;
  status: string;
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  scripts: Array<{
    id: string;
    version: number;
    source: string;
    _count: { shots: number };
  }>;
};

export type StylePresetMeta = {
  key: string;
  name: string;
  description: string;
};
