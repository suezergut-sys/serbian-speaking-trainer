export interface DailyUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  resets_at: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
  access_tier: "free" | "premium";
  registered_at: string;
  last_active_at: string;
  daily_usage: DailyUsage;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  access_tier: "free" | "premium";
  registered_at: string;
  last_active_at: string;
  phrases_today: number;
}
