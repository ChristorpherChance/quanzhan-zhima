-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'local-user',
    "currentStage" TEXT NOT NULL DEFAULT 'requirement',
    "seedType" TEXT,
    "hitlMode" TEXT NOT NULL DEFAULT 'manual',
    "hitlThreshold" REAL NOT NULL DEFAULT 0.8,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "storagePath" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "messagesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "logs" TEXT NOT NULL DEFAULT '',
    "errorMsg" TEXT,
    "costTokens" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "confidence" REAL,
    "lockedAt" DATETIME,
    "reopenReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Project_currentStage_idx" ON "Project"("currentStage");

-- CreateIndex
CREATE INDEX "Project_seedType_idx" ON "Project"("seedType");

-- CreateIndex
CREATE INDEX "Artifact_projectId_type_idx" ON "Artifact"("projectId", "type");

-- CreateIndex
CREATE INDEX "Artifact_projectId_type_version_idx" ON "Artifact"("projectId", "type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_projectId_agentType_key" ON "Conversation"("projectId", "agentType");

-- CreateIndex
CREATE INDEX "Job_projectId_agentType_idx" ON "Job"("projectId", "agentType");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Gate_projectId_type_key" ON "Gate"("projectId", "type");
