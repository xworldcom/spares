import { ApiError } from "./errors.ts";
import type { RecordConflictBody } from "../record-conflict.ts";
import { RECORD_CONFLICT_CODE } from "../record-conflict.ts";

export function isRecordConflictError(cause: unknown): cause is ApiError & RecordConflictBody {
  return (
    cause instanceof ApiError &&
    cause.status === 409 &&
    cause.code === RECORD_CONFLICT_CODE
  );
}
