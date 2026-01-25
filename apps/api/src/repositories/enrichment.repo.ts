import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";


export type EnrichmentStatus = "pending" | "success" | "failed";

export type EnrichmentPayload = {
  model?: string;
  status: EnrichmentStatus;

  nicheLabels?: string[];
  languageDetected?: string;
  fitSummary?: string;
  brandSafetyNotes?: string;
  redFlags?: string[];

  raw?: any;
};

export async function markPending(params: { runId: string; channelId: string }) {
  const { runId, channelId } = params;

  return prisma.runResultEnrichment.upsert({
    where: { runId_channelId: { runId, channelId } },
    update: { status: "pending" },
    create: { runId, channelId, status: "pending" }
  });
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
}) {
  const { runId, channelId, model, error } = params;

  return prisma.runResultEnrichment.upsert({
    where: { runId_channelId: { runId, channelId } },
    update: {
      status: "failed",
      model: model ?? null,
      raw: { error }
    },
    create: {
      runId,
      channelId,
      status: "failed",
      model: model ?? null,
      raw: { error }
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