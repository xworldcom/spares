export type Role = "staff" | "customer";

export type Site = {
  id: string;
  company: string;
  name: string;
};

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
  siteIds?: string[];
  companyAccess?: string[];
  machineIds?: string[];
  emailDomain?: string;
  sites?: Site[];
};

export type Part = {
  id: string;
  name: string;
  meshName: string;
  qty: number;
  material?: string;
  vendor?: string;
  weight?: string;
  category?: string;
  replaces?: string;
  stock?: string;
};

export type UnmatchedPart = {
  source: "list" | "model";
  id?: string;
  name?: string;
  meshName?: string;
  qty?: number;
};

export type MachineSummary = {
  id: string;
  name: string;
  siteId?: string;
  company?: string;
  siteName?: string;
  version?: number;
};

export type MachineDetail = {
  id: string;
  name: string;
  fileUrl: string;
  parts: Part[];
  unmatched?: UnmatchedPart[];
  siteId?: string;
  company?: string;
  siteName?: string;
  version?: number;
  revisedAt?: string;
};

export type MachineView = {
  id: string;
  at: string;
  userId: string;
  email: string;
  machineId: string;
};

export type QuoteStatus =
  | "requested"
  | "in_review"
  | "pricing"
  | "quoted"
  | "po_received"
  | "confirmed"
  | "ordered"
  | "shipped"
  | "delivered"
  | "closed"
  | "cancelled";

export type TrackingCarrier = "UPS" | "FedEx" | "Purolator" | "Other";

export type QuoteShipment = {
  id: string;
  trackingNumber: string;
  carrier?: TrackingCarrier;
  trackingUrl?: string;
};

export type QuoteItem = {
  id: string;
  name?: string;
  qty: number;
  sellPrice?: number;
  supplierCost?: number;
  supplier?: string;
  leadTimeDays?: number;
  note?: string;
  material?: string;
  vendor?: string;
  replaces?: string;
  stock?: string;
  category?: string;
};

export type QuoteActivityKind = "message" | "status" | "pricing" | "po" | "shipment";

export type QuoteActivity = {
  id: string;
  at: string;
  actorRole: Role;
  actorEmail: string;
  kind: QuoteActivityKind;
  text: string;
};

export type Quote = {
  id: string;
  number: number;
  machineId: string;
  items: QuoteItem[];
  note?: string;
  createdAt: string;
  customerEmail: string;
  machineName?: string;
  status: QuoteStatus;
  poNumber?: string;
  poOriginalFileName?: string;
  poUploadedAt?: string;
  hasPoFile?: boolean;
  shipments: QuoteShipment[];
  activities: QuoteActivity[];
  unread: boolean;
  invoiceNumber?: string;
};

export type QuoteRecord = {
  id: string;
  number: number;
  machineId: string;
  items: QuoteItem[];
  note?: string;
  createdAt: string;
  customerEmail: string;
  customerId: string;
  status: QuoteStatus;
  poNumber?: string;
  poStoredFileName?: string;
  poOriginalFileName?: string;
  poUploadedAt?: string;
  shipments: QuoteShipment[];
  activities: QuoteActivity[];
  lastReadAt: Record<string, string>;
  invoiceNumber?: string;
};

export type BugReport = {
  id: string;
  description: string;
  createdAt: string;
  path: string;
  userAgent: string;
  userEmail?: string;
  userRole?: Role;
  logText: string;
  screenshotUrl?: string;
  githubIssueUrl?: string;
  delivery: "github" | "store";
};

export type PartsListRow = {
  partNumber: string;
  name: string;
  meshName?: string;
  qty: number;
  material?: string;
  vendor?: string;
  weight?: string;
  category?: string;
  replaces?: string;
  stock?: string;
};

export type ManualCategory =
  | "operator"
  | "maintenance"
  | "electrical"
  | "mechanical"
  | "hmi"
  | "safety";

export type MachineManual = {
  id: string;
  machineId: string;
  title: string;
  category: ManualCategory;
  storedFileName: string;
  originalFileName: string;
  contentType: string;
  sizeBytes?: number;
  uploadedAt: string;
  uploadedByEmail: string;
};

export type PublicMachineManual = MachineManual & {
  fileUrl: string;
};

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_customer"
  | "resolved"
  | "closed";

export type TicketActivityKind = "message" | "status";

export type TicketActivity = {
  id: string;
  at: string;
  actorRole: Role;
  actorEmail: string;
  kind: TicketActivityKind;
  text: string;
};

export type ServiceTicketRecord = {
  id: string;
  number: number;
  machineId: string;
  title: string;
  status: TicketStatus;
  createdAt: string;
  customerId: string;
  customerEmail: string;
  activities: TicketActivity[];
  lastReadAt: Record<string, string>;
};

export type ServiceTicket = {
  id: string;
  number: number;
  machineId: string;
  machineName?: string;
  title: string;
  status: TicketStatus;
  createdAt: string;
  customerEmail: string;
  activities: TicketActivity[];
  unread: boolean;
};

export type UsageHistoryEntry = {
  id: string;
  at: string;
  actorEmail: string;
  summary: string;
};

export type MachineUsage = {
  machineId: string;
  hours?: number;
  cycles?: number;
  lastServiceAt?: string;
  notes?: string;
  updatedAt: string;
  updatedByEmail: string;
  history: UsageHistoryEntry[];
};

export type CareOverview = {
  machine: MachineSummary;
  manuals: number;
  ticketsOpen: number;
  ticketsTotal: number;
  usage?: Pick<
    MachineUsage,
    "hours" | "cycles" | "lastServiceAt" | "notes" | "updatedAt"
  >;
};
