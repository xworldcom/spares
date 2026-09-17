export type Role = "staff" | "customer";

/** Automation company (host) sharing the platform; not an end-customer account. */
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** When set, tenant is marked inactive for platform admin (data unchanged). */
  inactiveAt?: string;
  /** Platform admin removed this satellite host from the directory (catalog rows may remain). */
  deletedAt?: string;
  /** First staff login created with this tenant; used to repair heal mis-assignments to the host tenant. */
  bootstrapStaffEmail?: string;
};

export type CustomerAccount = {
  id: string;
  name: string;
  createdAt: string;
  deletedAt?: string;
  tenantId?: string;
};

export type Site = {
  id: string;
  customerId: string;
  name: string;
  createdAt: string;
  deletedAt?: string;
  tenantId?: string;
  /** Legacy field from pre-v2 plant rows; kept for migration only. */
  company?: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name?: string;
  role: Role;
  tenantId?: string;
  platformOwner?: boolean;
  siteIds?: string[];
  /** Legacy corporate access; migrated to siteIds on read. */
  companyAccess?: string[];
  machineIds?: string[];
  emailDomain?: string;
  sites?: Site[];
  deletedAt?: string;
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
  tenantId?: string;
  company?: string;
  siteName?: string;
  version?: number;
  hasModel?: boolean;
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
  hasModel?: boolean;
  oem?: string;
  notes?: string;
};

export type MachineView = {
  id: string;
  at: string;
  userId: string;
  email: string;
  machineId: string;
  tenantId?: string;
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

/** Chat media attached to a Care ticket or quote message. Binary lives in R2 under `chat/`. */
export type ChatAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  r2Key: string;
  createdAt: string;
};

export type QuoteActivity = {
  id: string;
  at: string;
  actorRole: Role;
  actorEmail: string;
  kind: QuoteActivityKind;
  text: string;
  attachments?: ChatAttachment[];
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
  tenantId?: string;
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
  tenantId?: string;
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
  tenantId?: string;
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
  attachments?: ChatAttachment[];
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
  tenantId?: string;
  activities: TicketActivity[];
  lastReadAt: Record<string, string>;
};

/** Customer read receipt on a Care ticket (staff-only in API responses). */
export type TicketCustomerReadReceipt = {
  userId: string;
  email: string;
  name?: string;
  readAt: string;
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
  /** Present for staff when at least one customer has read through the latest activity. */
  customerReadReceipts?: TicketCustomerReadReceipt[];
};

export type ServiceVisitSnapshot = {
  hours?: number;
  cycles?: number;
  lastServiceAt?: string;
  notes?: string;
};

export type UsageHistoryEntry = {
  id: string;
  at: string;
  actorEmail: string;
  summary: string;
  snapshot?: ServiceVisitSnapshot;
};

export type MachineUsage = {
  machineId: string;
  tenantId?: string;
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
