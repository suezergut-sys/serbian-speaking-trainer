import { authenticatedFetch } from "../auth";
import { apiUrl } from "./baseUrl";

export type Country = "russia" | "serbia" | "other";
export type Method = "sbp" | "alta" | "paypal";
export type PaymentStatus = "awaiting_payment" | "awaiting_review" | "confirmed" | "rejected" | "cancelled";
export type Localized = { ru: string; en: string };
export type Payment = {
  id: string; user_id: string; country: Country; method: Method; status: PaymentStatus;
  details: { amount: string; currency: string; recipient: string; phone?: string | null; bank?: string | null;
    account?: string | null; bank_details?: string | null; paypal?: string | null; paypal_url?: string | null; instructions: Localized };
  activation: Localized; created_at: string; paid_at: string | null; reported_amount: string | null;
  transaction_id: string | null; reviewed_by: string | null; reviewed_at: string | null;
  provisional_granted_at: string | null;
};
export type PaymentOptions = { activation: Localized | null; countries: Record<Country, Method[]>; methods: Record<Method, { available: boolean; currencies?: string[] }> };
export type AdminPayment = Payment & { email: string; display_name: string | null };

export async function paymentRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await authenticatedFetch(apiUrl(`/api${path}`), {
    method, signal, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error("payment_request_failed");
  return response.json() as Promise<T>;
}
