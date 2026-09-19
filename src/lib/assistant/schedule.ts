import { after } from "next/server";
import { replyAsAssistant, type AssistantJob } from "./reply.ts";

export function scheduleAssistantReply(job: AssistantJob) {
  const run = () =>
    void replyAsAssistant(job).catch((cause) => {
      console.error("assistant reply failed", cause);
    });
  try {
    after(run);
  } catch {
    run();
  }
}
