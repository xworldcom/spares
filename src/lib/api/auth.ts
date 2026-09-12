import { apiFetch } from "./client";
import { ApiError } from "./errors";
import type {
  AuthUserResponse,
  CustomerAccount,
  CustomerAccountDetailResponse,
  CustomerAccountsListResponse,
  CustomersListResponse,
  PublicUser,
  SitesListResponse,
  Site,
} from "./types";

export async function login(email: string, password: string) {
  const data = await apiFetch<AuthUserResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function logout() {
  await apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<PublicUser | null> {
  try {
    const data = await apiFetch<AuthUserResponse>("/api/auth/me");
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      return null;
    }
    throw error;
  }
}

export async function listCustomers(): Promise<PublicUser[]> {
  const data = await apiFetch<CustomersListResponse>("/api/staff/customers");
  return data.customers ?? [];
}

export async function createPerson(
  email: string,
  password: string,
  access: { siteIds?: string[]; machineIds?: string[] } = {},
) {
  const data = await apiFetch<AuthUserResponse>("/api/staff/customers", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      siteIds: access.siteIds ?? [],
      machineIds: access.machineIds ?? [],
    }),
  });
  return data.user;
}

/** @deprecated Use createPerson */
export const createCustomer = createPerson;

export async function updatePersonAccess(
  userId: string,
  access: { siteIds: string[]; machineIds: string[] },
) {
  const data = await apiFetch<AuthUserResponse>(`/api/staff/customers/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({
      siteIds: access.siteIds,
      machineIds: access.machineIds,
    }),
  });
  return data.user;
}

export async function updatePersonSites(userId: string, siteIds: string[]) {
  const data = await apiFetch<AuthUserResponse>(`/api/staff/customers/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ siteIds }),
  });
  return data.user;
}

/** @deprecated Use updatePersonSites */
export const updateCustomerSites = updatePersonSites;

export async function deletePerson(userId: string) {
  await apiFetch<{ ok: true }>(`/api/staff/customers/${userId}`, {
    method: "DELETE",
  });
}

export async function listSites(customerId?: string): Promise<Site[]> {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  const data = await apiFetch<SitesListResponse>(`/api/staff/sites${query}`);
  return data.sites ?? [];
}

export async function createSite(customerId: string, name: string): Promise<Site> {
  const data = await apiFetch<{ site: Site }>("/api/staff/sites", {
    method: "POST",
    body: JSON.stringify({ customerId, name }),
  });
  return data.site;
}

export async function updateSite(
  siteId: string,
  patch: { name?: string; customerId?: string },
): Promise<Site> {
  const data = await apiFetch<{ site: Site }>(`/api/staff/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.site;
}

export async function deleteSite(siteId: string) {
  await apiFetch<{ ok: true }>(`/api/staff/sites/${siteId}`, {
    method: "DELETE",
  });
}

export async function listCustomerAccounts(): Promise<
  Array<CustomerAccount & { siteCount: number }>
> {
  const data = await apiFetch<CustomerAccountsListResponse>("/api/staff/accounts");
  return data.accounts ?? [];
}

export async function createCustomerAccount(name: string) {
  const data = await apiFetch<{ account: CustomerAccount & { siteCount: number } }>(
    "/api/staff/accounts",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
  return data.account;
}

export async function getCustomerAccountDetail(id: string) {
  return apiFetch<CustomerAccountDetailResponse>(`/api/staff/accounts/${id}`);
}

export async function updateCustomerAccount(id: string, name: string) {
  const data = await apiFetch<{ account: CustomerAccount }>(`/api/staff/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return data.account;
}

export async function deleteCustomerAccount(id: string) {
  await apiFetch<{ ok: true }>(`/api/staff/accounts/${id}`, {
    method: "DELETE",
  });
}
