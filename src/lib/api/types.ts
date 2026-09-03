import type { MachineSummary, PublicUser, Quote } from "@/types";

export type {
  MachineDetail,
  MachineSummary,
  Part,
  PartsListRow,
  PublicUser,
  Quote,
  QuoteItem,
  Role,
  UnmatchedPart,
} from "@/types";

export type AuthUserResponse = {
  user: PublicUser;
};

export type MachinesListResponse = {
  machines: MachineSummary[];
};

export type QuotesListResponse = {
  quotes: Quote[];
};

export type CreateQuoteResponse = {
  quote: Quote;
};

export type ApiErrorBody = {
  error: string;
};
