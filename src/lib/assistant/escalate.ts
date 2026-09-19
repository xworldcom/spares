const ESCALATE_PATTERNS = [
  /\bescalat(e|ion)\b/i,
  /\b(talk|speak|get)\s+(to\s+|me\s+)?(a\s+)?(real\s+)?(human|person|technician|tech|someone)\b/i,
  /\b(need|want)\s+(a\s+)?(human|person|technician|tech)\b/i,
  /\b(call|page|get)\s+(support|service|staff|maintenance)\b/i,
  /\bhand\s+(this\s+)?off\b/i,
  /\b(real|actual)\s+(person|human|technician)\b/i,
  /\bcan'?t\s+(you\s+)?help\b/i,
  /\bthis\s+isn'?t\s+helping\b/i,
];

const ASSISTANT_MENTION_PATTERNS = [
  /@ai\b/i,
  /\bhey\s+ai\b/i,
  /\bai[,:]/i,
  /\bask\s+(the\s+)?ai\b/i,
  /\b(assistant|oee\s*ai)\b/i,
];

export function userAskedToEscalate(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return ESCALATE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function userAskedForAssistant(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return ASSISTANT_MENTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export const ESCALATE_USER_MESSAGE =
  "I've asked the service team to take this from here. A person will follow up in this thread.";

export const ESCALATE_UNAVAILABLE_MESSAGE =
  "I can't reach the language model right now, so I've asked the service team to take this.";

export const ESCALATE_STATUS_TEXT = "AI asked the service team to step in";
