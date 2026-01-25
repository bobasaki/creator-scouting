-- CreateTable
CREATE TABLE "RunResultEnrichment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nicheLabels" JSONB,
    "languageDetected" TEXT,
    "fitSummary" TEXT,
    "brandSafetyNotes" TEXT,
    "redFlags" JSONB,
    "raw" JSONB
);

-- CreateIndex
CREATE INDEX "RunResultEnrichment_runId_idx" ON "RunResultEnrichment"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RunResultEnrichment_runId_channelId_key" ON "RunResultEnrichment"("runId", "channelId");
