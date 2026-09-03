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

export type Quote = {
  id: string;
  machineId: string;
  partIds: string[];
  note?: string;
  createdAt: string;
  customerEmail: string;
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
