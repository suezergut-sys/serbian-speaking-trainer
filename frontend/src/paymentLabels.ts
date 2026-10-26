import type { Country, Method, PaymentStatus } from "./api/payments";

export const countryLabels: Record<Country, string> = { russia: "Россия", serbia: "Сербия", other: "Другая страна" };
export const methodLabels: Record<Method, string> = { sbp: "СБП", alta: "ALTA Banka", paypal: "PayPal" };
export const statusLabels: Record<PaymentStatus, string> = {
  awaiting_payment: "Ожидает оплаты", awaiting_review: "Ожидает проверки", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена",
};
