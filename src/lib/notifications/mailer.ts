export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export type ChatEmailMailer = {
  send(message: OutboundEmail): Promise<void>;
};

export function createChatEmailMailer(): ChatEmailMailer {
  return {
    async send(message) {
      console.info(
        JSON.stringify({
          tag: "chat-email-notify",
          to: message.to,
          subject: message.subject,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        }),
      );
    },
  };
}
