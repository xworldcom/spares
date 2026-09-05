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
  sites?: Site[];
};

export type Part = {
  id: string;
  name: string;
  meshName: string;
  qty: number;
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
};
