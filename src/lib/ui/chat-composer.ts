export const EMPTY_CHAT_MESSAGE_ERROR = "Message or an attachment is required.";

export function canSendChatMessage(text: string, attachmentCount: number) {
  return text.trim().length > 0 || attachmentCount > 0;
}
