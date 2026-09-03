import { readFile } from "node:fs/promises";
import { requireRole } from "@/lib/auth";
import { error } from "@/lib/http";
import { getBugReport, machineFilePath } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const report = await getBugReport(id);
  if (!report?.screenshotFileName) {
    return error("Screenshot not found", 404);
  }

  try {
    const bytes = await readFile(machineFilePath(report.screenshotFileName));
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return error("Screenshot file is missing", 404);
  }
}
