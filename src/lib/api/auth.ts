import { apiFetch } from "./client";
import { ApiError } from "./errors";
import type {
  AuthUserResponse,
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

export async function createCustomer(
  email: string,
  password: string,
  siteIds: string[] = [],
) {
  const data = await apiFetch<AuthUserResponse>("/api/staff/customers", {
    method: "POST",
    body: JSON.stringify({ email, password, siteIds }),
  });
  return data.user;
}

export async function listSites(): Promise<Site[]> {
  const data = await apiFetch<SitesListResponse>("/api/staff/sites");
  return data.sites ?? [];
}

export async function createSite(company: string, name: string): Promise<Site> {
  const data = await apiFetch<{ site: Site }>("/api/staff/sites", {
    method: "POST",
    body: JSON.stringify({ company, name }),
  });
  return data.site;
}

export async function updateCustomerSites(userId: string, siteIds: string[]) {
  const data = await apiFetch<AuthUserResponse>(`/api/staff/customers/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ siteIds }),
  });
  return data.user;
}
