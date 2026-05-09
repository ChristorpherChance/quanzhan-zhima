-- AlterTable
ALTER TABLE "Job" ADD COLUMN "meta" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "confidence" REAL DEFAULT 0;

-- CreateTable
CREATE TABLE "PiSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "leafId" TEXT,
    "modelId" TEXT NOT NULL,
    "thinking" TEXT NOT NULL DEFAULT 'off',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PiSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "blocks" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PiSession_projectId_idx" ON "PiSession"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PiSession_projectId_agentType_key" ON "PiSession"("projectId", "agentType");

-- CreateIndex
CREATE INDEX "Message_sessionId_ts_idx" ON "Message"("sessionId", "ts");
