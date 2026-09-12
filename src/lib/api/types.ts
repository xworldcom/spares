import type {
  BugReport,
  CareOverview,
  CustomerAccount,
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
  CustomerAccount,
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

export type CustomerAccountsListResponse = {
  accounts: Array<CustomerAccount & { siteCount: number }>;
};

export type CustomerAccountDetailResponse = {
  account: CustomerAccount;
  sites: Array<Site & { machineCount: number }>;
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
  unreadCount: number;
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
