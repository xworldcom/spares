import type { CustomerAccount, Site } from "../types/index.ts";

export function activeCustomers(accounts: readonly CustomerAccount[]) {
  return accounts.filter((row) => !row.deletedAt);
}

export function activeSites(sites: readonly Site[]) {
  return sites.filter((row) => !row.deletedAt);
}

export function customerForSite(
  site: Pick<Site, "customerId">,
  accounts: readonly CustomerAccount[],
) {
  return accounts.find((row) => row.id === site.customerId && !row.deletedAt);
}

export function siteCompanyName(
  site: Partial<Pick<Site, "customerId" | "company">>,
  accounts: readonly CustomerAccount[] = [],
) {
  if (site.customerId) {
    const customer = customerForSite({ customerId: site.customerId }, accounts);
    if (customer) {
      return customer.name;
    }
  }
  return site.company?.trim() ?? "";
}

export function siteLabel(
  site: Pick<Site, "name"> & Partial<Pick<Site, "customerId" | "company">>,
  accounts: readonly CustomerAccount[] = [],
) {
  const company = siteCompanyName(site, accounts);
  return company ? `${company} · ${site.name}` : site.name;
}

export function customerAllSitesLabel(customer: Pick<CustomerAccount, "name">) {
  return `${customer.name} · All sites`;
}

export function sitesForCustomer(
  customerId: string,
  sites: readonly Site[],
) {
  return activeSites(sites).filter((site) => site.customerId === customerId);
}

export function siteCountForCustomer(
  customerId: string,
  sites: readonly Site[],
) {
  return sitesForCustomer(customerId, sites).length;
}
