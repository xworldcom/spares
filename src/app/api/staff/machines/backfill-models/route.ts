import { requireRole } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { isModelFilename } from "@/lib/machines";
import {
  backfillModelToS3,
  selectModelStoreKind,
  type ModelBackfillResult,
} from "@/lib/model-storage";
import { listMachineModelFiles } from "@/lib/store";

export async function POST() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  if (selectModelStoreKind() !== "s3") {
    return error(
      "S3/R2 is not configured. Set S3_ENDPOINT, S3_BUCKET, and credentials before running backfill.",
      400,
    );
  }

  const machines = await listMachineModelFiles();
  const results: Array<
    ModelBackfillResult & { machineId: string; machineName: string }
  > = [];

  for (const machine of machines) {
    if (!isModelFilename(machine.storedFileName)) {
      continue;
    }
    const result = await backfillModelToS3(machine.storedFileName);
    results.push({
      ...result,
      machineId: machine.id,
      machineName: machine.name,
    });
  }

  const summary = {
    copied: results.filter((row) => row.status === "copied").length,
    skippedExists: results.filter((row) => row.status === "skipped_exists").length,
    skippedMissing: results.filter((row) => row.status === "skipped_missing")
      .length,
    skippedTooLarge: results.filter((row) => row.status === "skipped_too_large")
      .length,
    errors: results.filter((row) => row.status === "error").length,
  };

  return json({ summary, results });
}
