import { Router } from "express";
import { generateStatusSchema } from "../../../../shared/schemas/generate-job";
import { getGenerationStatus, startGeneration } from "../lib/generation-service";
import { parseSessionId } from "../lib/paths";

export const generateRouter = Router();

generateRouter.post("/api/generate", async (req, res) => {
  try {
    const payload = await startGeneration(req.body ?? {});
    return res.status(202).json(payload);
  } catch (error) {
    if (error instanceof Error && ["INVALID_SESSION_ID", "INVALID_SESSION_PATH"].includes(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof Error && "issues" in error) {
      return res.status(400).json({ error: "INVALID_REQUEST", detail: error.message });
    }
    return res.status(500).json({ error: "GENERATION_START_FAILED", detail: error instanceof Error ? error.message : "Unknown error" });
  }
});

generateRouter.get("/api/generate/:jobId", async (req, res) => {
  try {
    const sessionId = parseSessionId(String(req.query.session_id ?? ""));
    const jobId = String(req.params.jobId ?? "");
    const job = await getGenerationStatus(sessionId, jobId);

    if (!job) {
      return res.status(404).json({ error: "JOB_NOT_FOUND" });
    }

    const status = generateStatusSchema.parse(job.status);
    return res.status(200).json({ ...job, status });
  } catch (error) {
    if (error instanceof Error && ["INVALID_SESSION_ID", "INVALID_SESSION_PATH"].includes(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "GENERATION_STATUS_FAILED", detail: error instanceof Error ? error.message : "Unknown error" });
  }
});
