import { apiFetch } from "./client";
import { ApiError } from "./errors";
import type { AuthUserResponse, PublicUser } from "./types";

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

export async function createCustomer(email: string, password: string) {
  const data = await apiFetch<AuthUserResponse>("/api/staff/customers", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}
