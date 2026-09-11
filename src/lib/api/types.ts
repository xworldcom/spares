import type {
  BugReport,
  CareOverview,
  MachineSummary,
  MachineUsage,
  PublicMachineManual,
  PublicUser,
  Quote,
  ServiceTicket,
  Site,
} from "@/types";

export type {
  BugReport,
  MachineDetail,
  MachineSummary,
  Part,
  PartsListRow,
  PublicUser,
  Quote,
  QuoteItem,
  Role,
  Site,
  UnmatchedPart,
} from "@/types";

export type AuthUserResponse = {
  user: PublicUser;
};

export type CustomersListResponse = {
  customers: PublicUser[];
};

export type SitesListResponse = {
  sites: Site[];
};

export type MachinesListResponse = {
  machines: MachineSummary[];
};

export type QuotesListResponse = {
  quotes: Quote[];
  unreadCount: number;
};

export type CreateQuoteResponse = {
  quote: Quote;
};

export type QuoteResponse = {
  quote: Quote;
};

export type {
  CareOverview,
  MachineManual,
  MachineUsage,
  ManualCategory,
  PublicMachineManual,
  QuoteActivity,
  QuoteShipment,
  QuoteStatus,
  ServiceTicket,
  TicketStatus,
  TrackingCarrier,
} from "@/types";

export type CareOverviewResponse = {
  overview: CareOverview;
  recentTickets: ServiceTicket[];
};

export type ManualsListResponse = {
  manuals: PublicMachineManual[];
};

export type ManualResponse = {
  manual: PublicMachineManual;
};

export type TicketsListResponse = {
  tickets: ServiceTicket[];
};

export type TicketResponse = {
  ticket: ServiceTicket;
};

export type UsageResponse = {
  usage: MachineUsage | null;
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
