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
  meshName?: string;
};
