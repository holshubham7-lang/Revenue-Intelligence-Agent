import { API_URL } from "./constants";
import type {
  ActivityResult,
  AdminProfile,
  AdminUser,
  Paginated,
  Stats,
  UserActivityClient,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 401 && !path.startsWith("/admin/auth/")) {
    if (typeof window !== "undefined") {
      window.location.replace(`${window.location.origin}/login`);
    }
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { message?: string | string[] })?.message?.toString() ??
      `Request failed (${res.status})`;
    throw new ApiError(
      Array.isArray(message) ? message.join(", ") : message,
      res.status,
    );
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<AdminProfile>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ message: string }>("/admin/auth/logout", { method: "POST" }),

  me: () => request<AdminProfile>("/admin/auth/me"),

  stats: () => request<Stats>("/admin/stats"),

  listUsers: (params: {
    search?: string;
    provider?: string;
    emailVerified?: string;
    blocked?: string;
    includeTest?: boolean;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") qs.set(key, String(value));
    }
    return request<Paginated<AdminUser>>(`/admin/users?${qs.toString()}`);
  },

  getUser: (id: string) => request<AdminUser>(`/admin/users/${id}`),

  updateUser: (
    id: string,
    patch: {
      name?: string;
      isEmailVerified?: boolean;
      isBlocked?: boolean;
      newPassword?: string;
    },
  ) =>
    request<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteUser: (id: string) =>
    request<{ id: string }>(`/admin/users/${id}`, { method: "DELETE" }),

  activity: async (id: string, limit = 100): Promise<UserActivityClient> => {
    const data = await request<ActivityResult>(
      `/admin/users/${id}/activity?limit=${limit}`,
    );
    return { items: data.items, total: data.total, hasMore: data.total > data.items.length };
  },
};