export type AssistantModelOption = {
  id: string;
  label: string;
  hint: string;
};

/** Curated platform list — vision-capable models we are willing to run on plant chats. */
export const ASSISTANT_MODEL_OPTIONS: readonly AssistantModelOption[] = [
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    hint: "Fast. Default for photos, video, and PDF drawings.",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    hint: "Stronger reasoning on long manuals and schematics.",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    hint: "Careful written procedures. Good with PDFs and photos.",
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
    hint: "Newer Sonnet. Same job as 4.6.",
  },
  {
    id: "anthropic/claude-opus-4.6",
    label: "Claude Opus 4.6",
    hint: "Slowest. Hard electrical and mechanical questions.",
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    hint: "Photos. Long video is weaker than Gemini.",
  },
  {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    hint: "Newer GPT. Same role as 5.4.",
  },
] as const;

export const DEFAULT_ASSISTANT_MODEL = ASSISTANT_MODEL_OPTIONS[0].id;

const ALLOWED = new Set(ASSISTANT_MODEL_OPTIONS.map((row) => row.id));

export function isAllowedAssistantModel(value: string): boolean {
  return ALLOWED.has(value);
}

export function resolveAssistantModel(value: unknown): string {
  if (typeof value === "string" && isAllowedAssistantModel(value.trim())) {
    return value.trim();
  }
  return DEFAULT_ASSISTANT_MODEL;
}

export function assistantModelOption(id: string): AssistantModelOption | undefined {
  return ASSISTANT_MODEL_OPTIONS.find((row) => row.id === id);
}
