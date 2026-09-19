import type { ChatAttachment } from "../../types/index.ts";
import { MAX_CARE_TEXT } from "../care.ts";
import { notifyMachineChatUpdate } from "../notifications/chat-email.ts";
import {
  appendQuoteActivity,
  appendTicketActivity,
  getPlatformAssistantSettingsFromCatalog,
  getQuote,
  getTicket,
  setQuoteAssistantPaused,
  setTicketAssistantPaused,
} from "../store.ts";
import { ASSISTANT_ACTOR } from "./actor.ts";
import { loadAssistantMachineContext, loadAssistantThread } from "./context.ts";
import {
  ESCALATE_STATUS_TEXT,
  ESCALATE_UNAVAILABLE_MESSAGE,
  ESCALATE_USER_MESSAGE,
} from "./escalate.ts";
import { generateAssistantReply, type AssistantGenerateResult } from "./generate.ts";
import {
  lastHumanMessage,
  shouldAssistantReply,
  shouldForceEscalate,
  type AssistantTriggerActivity,
} from "./should-reply.ts";
import type { AssistantThreadKind } from "./context.ts";

const running = new Set<string>();

export type AssistantJob = {
  kind: AssistantThreadKind;
  id: string;
  tenantId: string;
  machineId: string;
  machineName: string;
  triggerText: string;
  triggerRole: string;
  triggerEmail: string;
  attachments?: ChatAttachment[];
};

function threadKey(job: Pick<AssistantJob, "kind" | "id">) {
  return `${job.kind}:${job.id}`;
}

function triggerFromJob(job: AssistantJob): AssistantTriggerActivity {
  return {
    kind: "message",
    actorRole: job.triggerRole,
    actorEmail: job.triggerEmail,
    text: job.triggerText,
  };
}

function policyAllowsReply(
  enabled: boolean,
  paused: boolean,
  trigger: AssistantTriggerActivity,
  activities: readonly AssistantTriggerActivity[],
) {
  return shouldAssistantReply({
    enabled,
    paused,
    trigger,
    activities,
  });
}

function clipCare(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CARE_TEXT) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_CARE_TEXT - 1)}…`;
}

async function postAssistantMessage(
  job: AssistantJob,
  text: string,
  attachments?: ChatAttachment[],
) {
  if (job.kind === "care") {
    return appendTicketActivity(
      job.id,
      job.tenantId,
      ASSISTANT_ACTOR,
      clipCare(text),
      attachments,
    );
  }
  return appendQuoteActivity(
    job.id,
    job.tenantId,
    ASSISTANT_ACTOR,
    "message",
    text,
    attachments,
  );
}

async function pauseThread(job: AssistantJob) {
  if (job.kind === "care") {
    await setTicketAssistantPaused(job.id, job.tenantId, true);
    return;
  }
  await setQuoteAssistantPaused(job.id, job.tenantId, true);
}

async function notifyEscalate(job: AssistantJob, text: string) {
  const context =
    job.kind === "care"
      ? await (async () => {
          const ticket = await getTicket(job.id, job.tenantId);
          if (!ticket) {
            return null;
          }
          return {
            kind: "care" as const,
            ticketId: ticket.id,
            ticketNumber: ticket.number,
            ticketTitle: ticket.title,
            machineId: ticket.machineId,
            machineName: job.machineName,
          };
        })()
      : await (async () => {
          const quote = await getQuote(job.id, job.tenantId);
          if (!quote) {
            return null;
          }
          return {
            kind: "quote" as const,
            quoteNumber: quote.number,
            machineId: quote.machineId,
            machineName: job.machineName,
          };
        })();
  if (!context) {
    return;
  }
  await notifyMachineChatUpdate({
    tenantId: job.tenantId,
    sender: {
      id: ASSISTANT_ACTOR.id,
      email: ASSISTANT_ACTOR.email,
      name: ASSISTANT_ACTOR.name,
    },
    text,
    attachmentCount: 0,
    context,
  });
}

async function escalateThread(job: AssistantJob, message: string) {
  await pauseThread(job);
  if (job.kind === "care") {
    await appendTicketActivity(
      job.id,
      job.tenantId,
      ASSISTANT_ACTOR,
      clipCare(message),
    );
  } else {
    await appendQuoteActivity(
      job.id,
      job.tenantId,
      ASSISTANT_ACTOR,
      "message",
      message,
    );
  }
  await notifyEscalate(job, ESCALATE_STATUS_TEXT);
}

export async function replyAsAssistant(
  job: AssistantJob,
  generate: typeof generateAssistantReply = generateAssistantReply,
) {
  const key = threadKey(job);
  if (running.has(key)) {
    return { skipped: "busy" as const };
  }
  running.add(key);
  try {
    const settings = await getPlatformAssistantSettingsFromCatalog();
    const thread = await loadAssistantThread(job.kind, job.id, job.tenantId);
    if (!thread) {
      return { skipped: "missing" as const };
    }
    const trigger = triggerFromJob(job);
    if (!policyAllowsReply(settings.enabled, thread.paused, trigger, thread.activities)) {
      return { skipped: "policy" as const };
    }

    const speaker = lastHumanMessage(thread.activities) ?? trigger;
    if (shouldForceEscalate(speaker.text ?? "", speaker.actorRole)) {
      await escalateThread(job, ESCALATE_USER_MESSAGE);
      return { escalated: true as const };
    }

    const machine = await loadAssistantMachineContext(thread.machineId, job.tenantId);
    if (!machine) {
      await escalateThread(job, ESCALATE_USER_MESSAGE);
      return { escalated: true as const };
    }

    let generated: AssistantGenerateResult;
    try {
      generated = await generate({
        model: settings.model,
        kind: job.kind,
        title: thread.title,
        machine,
        activities: thread.activities,
        latestAttachments: job.attachments,
        tenantId: job.tenantId,
        speakerRole: speaker.actorRole,
      });
    } catch (cause) {
      console.error("assistant generate failed", cause);
      await escalateThread(job, ESCALATE_UNAVAILABLE_MESSAGE);
      return { escalated: true as const, unavailable: true as const };
    }

    const latest = await loadAssistantThread(job.kind, job.id, job.tenantId);
    if (!latest) {
      return { skipped: "missing" as const };
    }
    if (!policyAllowsReply(settings.enabled, latest.paused, trigger, latest.activities)) {
      return { skipped: "policy" as const };
    }

    if (generated.escalate) {
      await escalateThread(job, generated.text.trim() || ESCALATE_USER_MESSAGE);
      return { escalated: true as const };
    }

    const text = generated.text.trim();
    if (!text) {
      await escalateThread(job, ESCALATE_USER_MESSAGE);
      return { escalated: true as const };
    }

    await postAssistantMessage(job, text);
    return { replied: true as const };
  } finally {
    running.delete(key);
  }
}
