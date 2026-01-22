-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "region" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "maxChannels" INTEGER,
    "videosToAnalyze" INTEGER,
    "minAvgViews" INTEGER,
    "maxDaysSinceUpload" INTEGER,
    "minSubscribers" INTEGER
);

-- CreateTable
CREATE TABLE "RunResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "subscriberCount" INTEGER NOT NULL,
    "avgViewsLastN" INTEGER NOT NULL,
    "daysSinceLastUpload" INTEGER NOT NULL,
    "recentViews" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "finalScore" INTEGER NOT NULL,
    CONSTRAINT "RunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "RunResult_runId_idx" ON "RunResult"("runId");

-- CreateIndex
CREATE INDEX "RunResult_finalScore_idx" ON "RunResult"("finalScore");
