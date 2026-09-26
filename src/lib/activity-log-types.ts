export const ACTIVITY_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.sso_login",
  "auth.sso_provision",
  "staff.created",
  "person.created",
  "person.updated",
  "person.deleted",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "site.created",
  "site.updated",
  "site.deleted",
  "quote.created",
  "quote.updated",
  "quote.viewed",
  "quote.message",
  "ticket.created",
  "ticket.updated",
  "ticket.viewed",
  "ticket.message",
  "machine.created",
  "machine.updated",
  "machine.deleted",
  "tenant.created",
  "tenant.updated",
  "tenant.deleted",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.sso_login": "Signed in with Microsoft",
  "auth.sso_provision": "SSO staff created",
  "staff.created": "Staff created",
  "person.created": "Person created",
  "person.updated": "Person updated",
  "person.deleted": "Person removed",
  "customer.created": "Customer created",
  "customer.updated": "Customer updated",
  "customer.deleted": "Customer removed",
  "site.created": "Site created",
  "site.updated": "Site updated",
  "site.deleted": "Site removed",
  "quote.created": "Quote created",
  "quote.updated": "Quote updated",
  "quote.viewed": "Quote viewed",
  "quote.message": "Quote message",
  "ticket.created": "Ticket opened",
  "ticket.updated": "Ticket updated",
  "ticket.viewed": "Ticket viewed",
  "ticket.message": "Ticket message",
  "machine.created": "Machine added",
  "machine.updated": "Machine updated",
  "machine.deleted": "Machine removed",
  "tenant.created": "Host created",
  "tenant.updated": "Host updated",
  "tenant.deleted": "Host removed",
};

export type ActivityActorRole = "staff" | "customer" | "system";

export type ActivityActor = {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  role?: ActivityActorRole | null;
};

export type ActivityTarget = {
  type: string;
  id: string;
  label?: string;
};

export type ActivityDetailValue = string | number | boolean | null;

export type ActivityEvent = {
  id: string;
  at: string;
  tenantId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: ActivityActorRole | null;
  action: ActivityAction;
  summary: string;
  target?: ActivityTarget;
  details?: Record<string, ActivityDetailValue>;
};

export type ActivityAccount = {
  userId: string | null;
  email: string | null;
  name: string | null;
};

export type RecordAccountActivityInput = {
  tenantId: string;
  actor: ActivityActor;
  action: ActivityAction;
  summary: string;
  target?: ActivityTarget;
  details?: Record<string, ActivityDetailValue>;
};
