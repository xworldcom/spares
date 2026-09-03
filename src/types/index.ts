export type Role = "staff" | "customer";

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
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
};

export type MachineDetail = {
  id: string;
  name: string;
  fileUrl: string;
  parts: Part[];
  unmatched?: UnmatchedPart[];
};

export type QuoteItem = {
  id: string;
  qty: number;
};

export type Quote = {
  id: string;
  machineId: string;
  items: QuoteItem[];
  note?: string;
  createdAt: string;
  customerEmail: string;
  machineName?: string;
};

export type PartsListRow = {
  partNumber: string;
  name: string;
  meshName?: string;
  qty: number;
};
