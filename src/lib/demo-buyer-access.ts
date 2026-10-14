/** Public demo customer on oee360.com — machine grants only, never whole customer sites. */
export const PUBLIC_DEMO_BUYER_EMAIL = "user@demo.com";

export const DEMO_BUYER_MACHINE_IDS: readonly string[] = [
  "hardware-fixture",
  "palletizer",
];

export const DEMO_BUYER_COMPANY_LABEL = "Demo Manufacturing";

const DEMO_BUYER_SITE_BY_MACHINE: Readonly<Record<string, string>> = {
  "hardware-fixture": "Plant 1",
  palletizer: "Plant 2",
};

export function normalizePublicDemoBuyerEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isPublicDemoBuyerEmail(email: string | undefined) {
  if (!email?.trim()) {
    return false;
  }
  return (
    normalizePublicDemoBuyerEmail(email) ===
    normalizePublicDemoBuyerEmail(PUBLIC_DEMO_BUYER_EMAIL)
  );
}

export function isDemoBuyerMachineId(machineId: string | undefined) {
  return Boolean(machineId && DEMO_BUYER_MACHINE_IDS.includes(machineId));
}

/**
 * When non-null, demo-buyer access is decided solely by the whitelist (site grants ignored).
 * Returns null for non–demo-buyer users so normal access rules apply.
 */
export function demoBuyerMachineAccess(
  user: { email?: string; role?: string },
  machine: { id?: string },
): boolean | null {
  if (user.role === "staff" || !isPublicDemoBuyerEmail(user.email)) {
    return null;
  }
  return isDemoBuyerMachineId(machine.id);
}

export function demoBuyerMachineIdsGrant(): string[] {
  return [...DEMO_BUYER_MACHINE_IDS];
}

export function scrubMachineSiteFieldsForDemoBuyer(
  machine: { id: string; siteId?: string },
  fields: { siteId?: string; company?: string; siteName?: string },
) {
  if (!isDemoBuyerMachineId(machine.id)) {
    return fields;
  }
  return {
    siteId: machine.siteId,
    company: DEMO_BUYER_COMPANY_LABEL,
    siteName: DEMO_BUYER_SITE_BY_MACHINE[machine.id] ?? "Demo site",
  };
}
