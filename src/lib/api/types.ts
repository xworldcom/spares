import type { BugReport, MachineSummary, PublicUser, Quote } from "@/types";

export type {
  BugReport,
  MachineDetail,
  MachineSummary,
  Part,
  PartsListRow,
  PublicUser,
  Quote,
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

export type BugReportsListResponse = {
  reports: BugReport[];
};

export type SubmitBugReportResponse = {
  ok: true;
  id: string;
  githubIssueUrl?: string;
  stored: boolean;
};

export type ApiErrorBody = {
  error: string;
};
