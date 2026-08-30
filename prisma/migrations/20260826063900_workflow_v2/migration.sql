/*
  Warnings:

  - You are about to drop the column `shotId` on the `Asset` table. All the data in the column will be lost.
  - Added the required column `category` to the `Asset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "MaterialSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialSuggestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShotAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShotAsset_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShotAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("createdAt", "filename", "id", "mimeType", "sortOrder", "url") SELECT "createdAt", "filename", "id", "mimeType", "sortOrder", "url" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");
CREATE INDEX "Asset_projectId_category_idx" ON "Asset"("projectId", "category");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "sellingPoints" TEXT NOT NULL DEFAULT '',
    "stylePreset" TEXT NOT NULL DEFAULT 'drama_comedy',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentStep" TEXT NOT NULL DEFAULT 'script',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("brief", "createdAt", "id", "sellingPoints", "status", "stylePreset", "title", "updatedAt") SELECT "brief", "createdAt", "id", "sellingPoints", "status", "stylePreset", "title", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'generated',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Script" ("content", "createdAt", "id", "projectId", "version") SELECT "content", "createdAt", "id", "projectId", "version" FROM "Script";
DROP TABLE "Script";
ALTER TABLE "new_Script" RENAME TO "Script";
CREATE INDEX "Script_projectId_idx" ON "Script"("projectId");
CREATE TABLE "new_Shot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scriptId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT,
    "sceneDesc" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "dialogue" TEXT,
    "durationHint" TEXT,
    "refHints" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shot_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Shot" ("createdAt", "dialogue", "durationHint", "id", "prompt", "sceneDesc", "scriptId", "sequence", "title", "updatedAt") SELECT "createdAt", "dialogue", "durationHint", "id", "prompt", "sceneDesc", "scriptId", "sequence", "title", "updatedAt" FROM "Shot";
DROP TABLE "Shot";
ALTER TABLE "new_Shot" RENAME TO "Shot";
CREATE INDEX "Shot_scriptId_idx" ON "Shot"("scriptId");
CREATE UNIQUE INDEX "Shot_scriptId_sequence_key" ON "Shot"("scriptId", "sequence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MaterialSuggestion_projectId_idx" ON "MaterialSuggestion"("projectId");

-- CreateIndex
CREATE INDEX "ShotAsset_shotId_idx" ON "ShotAsset"("shotId");

-- CreateIndex
CREATE INDEX "ShotAsset_assetId_idx" ON "ShotAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ShotAsset_shotId_assetId_key" ON "ShotAsset"("shotId", "assetId");
