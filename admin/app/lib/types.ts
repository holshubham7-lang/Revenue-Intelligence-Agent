export type AdminProfile = {
  id: string;
  email: string;
  name: string;
};

export type AdminUser = {
  id: string;
  name: string;
  nameDecrypted: boolean;
  email: string;
  profileImage?: string;
  authProvider: "email" | "google" | "microsoft" | "linkedin";
  providerId?: string;
  isEmailVerified: boolean;
  isBlocked: boolean;
  isTestAccount: boolean;
  isAdmin: boolean;
  companyId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export type UserSortField =
  | "name"
  | "email"
  | "authProvider"
  | "createdAt"
  | "isEmailVerified"
  | "isBlocked";

export type Stats = {
  total: number;
  blocked: number;
  verified: number;
  unverified: number;
  byProvider: { provider: string; count: number }[];
  signedUp: { last7Days: number; last30Days: number };
};

export type ActivityItem = {
  id: string;
  event: string;
  actorType: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type ActivityResult = {
  items: ActivityItem[];
  total: number;
  limit: number;
  offset: number;
};

export type UserActivityClient = {
  items: ActivityItem[];
  total: number;
  hasMore: boolean;
};