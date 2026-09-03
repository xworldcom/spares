export type Role = "staff" | "customer";

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
};

/** Customer-pickable part. `id` is the Total ETO part number. */
export type Part = {
  id: string;
  name: string;
  meshName: string;
  qty?: number;
};

export type UnmatchedPart = {
  source: "list" | "model";
  id?: string;
  name?: string;
  meshName?: string;
};

export type MachineSummary = {
  id: string;
  name: string;
};

export type MachineDetail = {
  id: string;
  name: string;
  fileUrl: string;
  parts: Part[];
  unmatched?: UnmatchedPart[];
};

export type Quote = {
  id: string;
  machineId: string;
  partIds: string[];
  note?: string;
  createdAt: string;
  customerEmail: string;
};

export type PartsListRow = {
  partNumber: string;
  name: string;
  qty?: number;
  meshName?: string;
};

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
