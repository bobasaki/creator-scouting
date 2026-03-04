import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";


export type EnrichmentStatus = "pending" | "success" | "failed";

export type EnrichmentPayload = {
  model?: string;
  status: EnrichmentStatus;

  estimatedCategory?: string;
  estimatedType?: string;
  nicheLabels?: string[];
  languageDetected?: string;
  fitSummary?: string;
  brandSafetyNotes?: string;
  redFlags?: string[];

  sponsorship?: any;
  raw?: any;
};

export type CachedYouTubeContext = {
  description: string;
  recentTitles: string[];
  videoIds: string[];
  titles: string[];
  descriptions: string[];
};

export async function markPending(args: {
  runId: string;
  channelId: string;
}): Promise<{ claimed: boolean }> {
  const { runId, channelId } = args;

  // 10.7: DB-level claim to prevent duplicate OpenAI spend.
  // - If row exists AND is already pending: someone else is working -> NOT claimed.
  // - If row exists AND is not pending: flip it to pending -> claimed.
  // - If row doesn't exist: create pending -> claimed.
  //
  // Requires @@unique([runId, channelId]) in schema.

  // 1) Try to update existing non-pending row to pending
  const updated = await prisma.runResultEnrichment.updateMany({
    where: { runId, channelId, NOT: { status: "pending" } },
    data: {
      status: "pending",
      model: null,
      nicheLabels: Prisma.DbNull,
      languageDetected: null,
      fitSummary: null,
      brandSafetyNotes: null,
      redFlags: Prisma.DbNull,
      // Keep existing raw payload (e.g. cached YouTube context) for reuse in enrichment.
    }
  });

  if (updated.count > 0) return { claimed: true };

  // 2) If no update happened, check if row exists (likely pending)
  const existing = await prisma.runResultEnrichment.findUnique({
    where: { runId_channelId: { runId, channelId } }
  });

  if (existing) {
    // status is pending (or row otherwise not updatable) => not claimed
    return { claimed: false };
  }

  // 3) Create new pending row (race-safe due to unique constraint)
  try {
    await prisma.runResultEnrichment.create({
      data: {
        runId,
        channelId,
        status: "pending",
        model: null,
        nicheLabels: Prisma.DbNull,
        languageDetected: null,
        fitSummary: null,
        brandSafetyNotes: null,
        redFlags: Prisma.DbNull,
        raw: Prisma.DbNull
      }
    });

    return { claimed: true };
  } catch (err: any) {
    // If another worker created it concurrently, treat as not claimed
    const msg = String(err?.message ?? "").toLowerCase();
    if (msg.includes("unique") || msg.includes("constraint")) {
      return { claimed: false };
    }
    throw err;
  }
}

export async function saveSuccess(params: { runId: string; channelId: string; payload: EnrichmentPayload }) {
  const { runId, channelId, payload } = params;

  return prisma.runResultEnrichment.upsert({
    where: { runId_channelId: { runId, channelId } },
    update: {
      status: "success",
      model: payload.model ?? null,
      nicheLabels: payload.nicheLabels ?? Prisma.DbNull,
      languageDetected: payload.languageDetected ?? null,
      fitSummary: payload.fitSummary ?? null,
      brandSafetyNotes: payload.brandSafetyNotes ?? null,
      redFlags: payload.redFlags ?? Prisma.DbNull,
      raw: payload.raw ?? Prisma.DbNull
    },
    create: {
      runId,
      channelId,
      status: "success",
      model: payload.model ?? null,
      nicheLabels: payload.nicheLabels ?? Prisma.DbNull,
      languageDetected: payload.languageDetected ?? null,
      fitSummary: payload.fitSummary ?? null,
      brandSafetyNotes: payload.brandSafetyNotes ?? null,
      redFlags: payload.redFlags ?? Prisma.DbNull,
      raw: payload.raw ?? Prisma.DbNull
    }
  });
}

export async function saveFailure(params: {
  runId: string;
  channelId: string;
  model?: string;
  error: { message: string; code?: string };
  youtubeContext?: CachedYouTubeContext | null;
}) {
  const { runId, channelId, model, error, youtubeContext } = params;

  const rawPayload: Prisma.InputJsonObject = youtubeContext
    ? { error, youtubeContext }
    : { error };

  return prisma.runResultEnrichment.upsert({
    where: { runId_channelId: { runId, channelId } },
    update: {
      status: "failed",
      model: model ?? null,
      raw: rawPayload
    },
    create: {
      runId,
      channelId,
      status: "failed",
      model: model ?? null,
      raw: rawPayload
    }
  });
}

export async function saveCachedContext(params: {
  runId: string;
  channelId: string;
  context: CachedYouTubeContext;
}) {
  const { runId, channelId, context } = params;

  return prisma.runResultEnrichment.upsert({
    where: { runId_channelId: { runId, channelId } },
    update: {
      raw: {
        youtubeContext: context
      }
    },
    create: {
      runId,
      channelId,
      status: "cached",
      model: null,
      raw: {
        youtubeContext: context
      }
    }
  });
}

export async function getEnrichmentForRun(runId: string) {
  const rows = await prisma.runResultEnrichment.findMany({
    where: { runId }
  });

  // return as lookup map keyed by channelId
  const byChannelId: Record<string, any> = {};
  for (const r of rows) byChannelId[r.channelId] = r;
  return byChannelId;
}

export async function getEnrichmentsForRun(runId: string) {
  return prisma.runResultEnrichment.findMany({
    where: { runId }
  });
}
