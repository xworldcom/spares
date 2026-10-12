export const CUSTOMER_PART_ALERTS_HREF = "/part-alerts";
export const STAFF_PART_ALERTS_HREF = "/staff/part-alerts";

export function partAlertsHref(role: "customer" | "staff") {
  return role === "staff" ? STAFF_PART_ALERTS_HREF : CUSTOMER_PART_ALERTS_HREF;
}
