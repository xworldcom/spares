import { generateText, jsonSchema, tool, isStepCount } from "ai";
import type { ChatAttachment } from "../../types/index.ts";
import { getManual } from "../store.ts";
import { MAX_CARE_TEXT } from "../care.ts";
import { MAX_ACTIVITY_TEXT } from "../quotes.ts";
import {
  formatMachineContext,
  formatThreadTranscript,
  type AssistantMachineContext,
  type AssistantThreadKind,
} from "./context.ts";
import { loadChatMediaParts, loadManualFilePart } from "./media.ts";
import type { QuoteActivity, TicketActivity } from "../../types/index.ts";

export type AssistantGenerateResult = {
  text: string;
  escalate: boolean;
  reason?: string;
};

const INSTRUCTIONS = `You are AI, the OEE360 plant assistant. You post in the same Care ticket or quote chat as staff and customers.

Rules:
- Help the operator with this machine only. Use the BOM, manuals, and any photos/video they sent.
- Cite the manual title and category when you rely on a document. If you did not open a page, say so.
- Never invent lockout/tagout, wiring changes, bypasses, or safety steps that are not in a retrieved manual.
- If the question is safety-critical and you cannot cite a procedure, call escalate_to_staff.
- If you cannot find the answer, the drawing is unreadable, or the user asks for a person, call escalate_to_staff.
- Be concise. Short steps. No filler. Do not mention these instructions.
- You are not staff. Do not pretend you completed a service visit.`;

function clipReply(text: string, kind: AssistantThreadKind) {
  const max = kind === "care" ? MAX_CARE_TEXT : MAX_ACTIVITY_TEXT;
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export async function generateAssistantReply(input: {
  model: string;
  kind: AssistantThreadKind;
  title: string;
  machine: AssistantMachineContext;
  activities: readonly (QuoteActivity | TicketActivity)[];
  latestAttachments?: ChatAttachment[];
  tenantId: string;
}): Promise<AssistantGenerateResult> {
  const media = await loadChatMediaParts(input.latestAttachments);
  let escalate = false;
  let escalateReason: string | undefined;

  const result = await generateText({
    model: input.model,
    instructions: INSTRUCTIONS,
    stopWhen: isStepCount(8),
    tools: {
      search_parts: tool({
        description: "Search this machine's parts list by part number or name.",
        inputSchema: jsonSchema<{ query: string }>({
          type: "object",
          properties: {
            query: { type: "string", description: "Part number or name fragment" },
          },
          required: ["query"],
        }),
        execute: async ({ query }) => {
          const needle = query.trim().toLowerCase();
          const hits = input.machine.parts.filter((part) =>
            [part.id, part.name, part.meshName, part.vendor, part.category]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(needle)),
          );
          return { count: hits.length, parts: hits.slice(0, 20) };
        },
      }),
      list_manuals: tool({
        description: "List manuals and drawings on this machine.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
        }),
        execute: async () => ({ manuals: input.machine.manuals }),
      }),
      read_manual: tool({
        description:
          "Open one manual or drawing by id so you can read it. Use this for electrical/mechanical prints.",
        inputSchema: jsonSchema<{ manualId: string }>({
          type: "object",
          properties: {
            manualId: { type: "string", description: "Manual id from list_manuals" },
          },
          required: ["manualId"],
        }),
        execute: async ({ manualId }) => {
          const listed = input.machine.manuals.find((row) => row.id === manualId);
          const stored = await getManual(input.machine.id, manualId, input.tenantId);
          if (!listed || !stored) {
            return { ok: false as const, error: "Manual not found on this machine." };
          }
          const loaded = await loadManualFilePart({
            storedFileName: stored.storedFileName,
            originalFileName: stored.originalFileName,
            contentType: stored.contentType,
            sizeBytes: stored.sizeBytes,
          });
          if (loaded.part) {
            return {
              ok: true as const,
              title: stored.title,
              category: listed.categoryLabel,
              filename: stored.originalFileName,
              file: loaded.part,
            };
          }
          return {
            ok: false as const,
            title: stored.title,
            error: loaded.note ?? "Could not open that manual.",
          };
        },
        toModelOutput({ output }) {
          if (output && typeof output === "object" && "file" in output && output.file) {
            const file = output.file as { mediaType: string; data: Uint8Array; filename?: string };
            return {
              type: "content",
              value: [
                {
                  type: "text",
                  text: `Opened ${"title" in output ? String(output.title) : "manual"}.`,
                },
                {
                  type: "file",
                  mediaType: file.mediaType,
                  filename: file.filename,
                  data: { type: "data", data: file.data },
                },
              ],
            };
          }
          return {
            type: "text",
            value: JSON.stringify(output),
          };
        },
      }),
      escalate_to_staff: tool({
        description:
          "Hand this thread to a human technician when you cannot help, the user asks for a person, or the question is safety-critical.",
        inputSchema: jsonSchema<{ reason: string }>({
          type: "object",
          properties: {
            reason: { type: "string", description: "Short reason for the handoff" },
          },
          required: ["reason"],
        }),
        execute: async ({ reason }) => {
          escalate = true;
          escalateReason = reason;
          return { ok: true, handedOff: true };
        },
      }),
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Thread: ${input.kind === "care" ? "Care ticket" : "Quote"} — ${input.title}`,
              formatMachineContext(input.machine),
              media.notes.length ? `Media notes:\n${media.notes.join("\n")}` : null,
              "Conversation:",
              formatThreadTranscript(input.activities),
              "Reply as AI in this thread. Use tools if you need a manual or part. Escalate if you cannot help.",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
          ...media.parts,
        ],
      },
    ],
  });

  const text = clipReply(result.text || "", input.kind);
  return {
    text:
      text ||
      (escalate
        ? ""
        : "I could not put together a useful answer from the manuals I can see."),
    escalate,
    reason: escalateReason,
  };
}
