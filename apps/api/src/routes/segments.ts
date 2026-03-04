import { FastifyInstance } from "fastify";
import {
  createSavedSegment,
  deleteSavedSegment,
  listSavedSegments,
  markSavedSegmentUsed,
  updateSavedSegment
} from "../repositories/catalog.repo";
import {
  SavedSegmentCreateSchema,
  SavedSegmentUpdateSchema
} from "../schemas/catalog.schema";

export async function segmentsRoutes(app: FastifyInstance) {
  app.get("/segments", async () => {
    return listSavedSegments();
  });

  app.post("/segments", async (request, reply) => {
    const parsed = SavedSegmentCreateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    const segment = await createSavedSegment(parsed.data);
    return reply.status(201).send(segment);
  });

  app.patch("/segments/:segmentId", async (request, reply) => {
    const { segmentId } = request.params as { segmentId: string };
    const parsed = SavedSegmentUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    const segment = await updateSavedSegment({
      id: segmentId,
      ...parsed.data
    });

    if (!segment) {
      return reply.status(404).send({ error: "Segment not found" });
    }

    return segment;
  });

  app.post("/segments/:segmentId/use", async (request, reply) => {
    const { segmentId } = request.params as { segmentId: string };
    const segment = await markSavedSegmentUsed(segmentId);

    if (!segment) {
      return reply.status(404).send({ error: "Segment not found" });
    }

    return segment;
  });

  app.delete("/segments/:segmentId", async (request, reply) => {
    const { segmentId } = request.params as { segmentId: string };
    const deleted = await deleteSavedSegment(segmentId);

    if (!deleted) {
      return reply.status(404).send({ error: "Segment not found" });
    }

    return reply.status(204).send();
  });
}
