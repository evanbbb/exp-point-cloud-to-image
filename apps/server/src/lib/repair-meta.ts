import fs from "node:fs/promises";
import { repairMetaSchema, type RepairMeta } from "../../../../shared/schemas/repair-meta";

export async function writeRepairMeta(metaPath: string, meta: RepairMeta): Promise<void> {
  const parsed = repairMetaSchema.parse(meta);
  await fs.writeFile(metaPath, JSON.stringify(parsed, null, 2));
}
