import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentForm } from "../PaymentForm";
import { AdminPaymentsView } from "../AdminPaymentsView";
import { paymentRequest, type Payment, type PaymentOptions } from "../api/payments";
import { setLanguage } from "../i18n";

vi.mock("../api/payments", () => ({ paymentRequest: vi.fn() }));
const options: PaymentOptions = {
  activation: { ru: "Тестовый срок", en: "Test timeframe" },
  countries: { russia: ["sbp", "paypal"], serbia: ["paypal"], other: ["paypal"] },
  methods: { sbp: { available: true }, alta: { available: true }, paypal: { available: true } },
};
const payment: Payment = {
  id: "synthetic-request", user_id: "synthetic-user", country: "russia", method: "sbp", status: "awaiting_payment",
  provisional_granted_at: null,
  details: { amount: "500.00", currency: "RUB", recipient: "Synthetic Recipient", phone: "+70000000000", bank: "Synthetic bank", instructions: { ru: "Тестовая инструкция", en: "Test instruction" } },
  activation: options.activation!, created_at: "2026-10-26T12:00:00Z", paid_at: null, reported_amount: null, transaction_id: null, reviewed_by: null, reviewed_at: null,
};
function mockApi(current?: Payment) {
  vi.mocked(paymentRequest).mockImplementation(async (path, method, body) => {
    if (path === "/payments/options") return options;
    if (path === "/payments" && (!method || method === "GET")) return current ? [current] : [];
    if (path === "/payments") return { ...payment, ...body as object };
    if (path.endsWith("/cancel")) return { ...payment, status: "cancelled" };
    if (path.endsWith("/report")) return { ...payment, status: "awaiting_review" };
    throw new Error("Unexpected request");
  });
}
afterEach(() => { cleanup(); vi.resetAllMocks(); setLanguage("ru"); });

it.each(["ru", "en"] as const)("selects explicit country, resets method, copies exact values and reports once (%s)", async language => {
  setLanguage(language); const ru = language === "ru";
  mockApi();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<PaymentForm onClose={vi.fn()} />);
  const select = await screen.findByRole("combobox");
  await waitFor(() => expect(select.querySelectorAll("option")).toHaveLength(4));
  expect(select).toHaveValue("");
  expect(screen.queryByRole("button", { name: /PayPal/ })).not.toBeInTheDocument();
  fireEvent.change(select, { target: { value: "russia" } });
  fireEvent.click(await screen.findByRole("button", { name: /SBP|СБП/ }));
  await screen.findByText("+70000000000");
  fireEvent.click(screen.getByRole("button", { name: ru ? "Копировать: Телефон получателя" : "Copy: Recipient phone number" }));
  expect(writeText).toHaveBeenCalledWith("+70000000000");
  await screen.findByText(ru ? "Скопировано" : "Copied");
  fireEvent.change(select, { target: { value: "serbia" } });
  await waitFor(() => expect(screen.queryByText("+70000000000")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /SBP|СБП/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /ALTA Banka/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /PayPal/ })).toBeEnabled();
  fireEvent.change(select, { target: { value: "other" } });
  await waitFor(() => expect(screen.queryByRole("button", { name: /ALTA Banka/ })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /PayPal/ }));
  await screen.findByText("synthetic-request");
  fireEvent.change(screen.getByLabelText(ru ? "Дата и примерное время оплаты (ваш часовой пояс)" : "Payment date and approximate time (your time zone)"), { target: { value: "2026-10-25T12:34" } });
  fireEvent.change(screen.getByLabelText(/Переведённая сумма|Amount transferred/), { target: { value: "5.00" } });
  fireEvent.click(screen.getByRole("button", { name: ru ? "Я оплатил" : "I have paid" }));
  await screen.findByText(/Администратор проверит|The administrator will verify/);
  expect(select).toBeDisabled();
  expect(screen.queryByRole("button", { name: ru ? "Я оплатил" : "I have paid" })).not.toBeInTheDocument();
  const calls = vi.mocked(paymentRequest).mock.calls.filter(call => call[0].endsWith("/report"));
  expect(calls).toHaveLength(1);
  expect(calls[0][2]).toMatchObject({ amount: "5.00", transaction_id: null });
});

it.each(["ru", "en"] as const)("disables unconfigured methods (%s)", async language => {
  setLanguage(language); mockApi();
  vi.mocked(paymentRequest).mockImplementation(async path => path === "/payments/options" ? { ...options, activation: null, methods: { ...options.methods, sbp: { available: false } } } : []);
  render(<PaymentForm onClose={vi.fn()} />);
  await screen.findByText(/Условия активации ещё не настроены|The activation terms/);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "russia" } });
  expect(await screen.findByRole("button", { name: /СБП|SBP/ })).toBeDisabled();
  expect(screen.getByText(/Способ недоступен|Unavailable: payment/)).toBeInTheDocument();
});

it("restores awaiting review and shows refreshable errors", async () => {
  mockApi({ ...payment, status: "awaiting_review" });
  render(<PaymentForm onClose={vi.fn()} />);
  await screen.findByText(/Администратор проверит/);
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Я оплатил" })).not.toBeInTheDocument();
});

it("shows loading failure and retries without creating a request", async () => {
  vi.mocked(paymentRequest).mockRejectedValue(new Error("offline"));
  render(<PaymentForm onClose={vi.fn()} />);
  await screen.findByRole("alert");
  mockApi();
  fireEvent.click(screen.getByRole("button", { name: "Обновить статус" }));
  await screen.findByText("Тестовый срок");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(vi.mocked(paymentRequest).mock.calls.every(call => call[1] === "GET")).toBe(true);
});

it.each(["ru", "en"] as const)("shows automatic activation and lets admin revoke it (%s)", async language => {
  setLanguage(language); const ru = language === "ru";
  const automatic = { ...payment, status: "awaiting_review" as const, provisional_granted_at: "2026-10-26T12:00:00Z" };
  mockApi(automatic);
  const form = render(<PaymentForm onClose={vi.fn()} />);
  await screen.findByText(/Администратор проверит|The administrator will verify/);
  form.unmount();
  vi.mocked(paymentRequest).mockImplementation(async (_path, method) => method === "PATCH" ? { ...automatic, status: "rejected" } : [{ ...automatic, email: "synthetic@example.invalid", display_name: null }]);
  render(<AdminPaymentsView />);
  await screen.findByText("synthetic@example.invalid");
  fireEvent.click(screen.getByRole("button", { name: ru ? "Отклонить и отозвать доступ" : "Reject and revoke access" }));
  await screen.findByText(ru ? "Отклонена" : "Rejected");
  expect(vi.mocked(paymentRequest).mock.calls.find(call => call[1] === "PATCH")?.[2]).toEqual({ status: "rejected" });
});

it.each(["ru", "en"] as const)("requires receipt confirmation in admin and reflects terminal state (%s)", async language => {
  setLanguage(language); const ru = language === "ru";
  vi.mocked(paymentRequest).mockImplementation(async (_path, method) => method === "PATCH" ? { ...payment, status: "confirmed" } : [{ ...payment, email: "synthetic@example.invalid", display_name: null, status: "awaiting_review", paid_at: "2026-10-25T12:00:00Z", reported_amount: "500.00" }]);
  render(<AdminPaymentsView />);
  await screen.findByText("synthetic@example.invalid");
  fireEvent.click(screen.getByRole("button", { name: ru ? "Подтвердить оплату" : "Confirm payment" }));
  expect(vi.mocked(paymentRequest).mock.calls.filter(call => call[1] === "PATCH")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: ru ? "Деньги получены — включить Premium" : "Money received — activate Premium" }));
  await screen.findByText(ru ? "Подтверждена" : "Confirmed");
  expect(vi.mocked(paymentRequest).mock.calls.filter(call => call[1] === "PATCH")).toHaveLength(1);
});


it.each(["ru", "en"] as const)("withholds retired ALTA bank details but preserves settlement (%s)", async language => {
  setLanguage(language);
  mockApi({ ...payment, method: "alta", country: "serbia", details: { ...payment.details, currency: "RSD", account: "retired-account-secret" } });
  render(<PaymentForm onClose={vi.fn()} />);
  await screen.findByText(/Этот способ больше|This method is no longer/);
  expect(screen.queryByText("retired-account-secret")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /ALTA Banka/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: language === "ru" ? "Я оплатил" : "I have paid" })).toBeEnabled();
});


it.each(["ru", "en"] as const)("copies the complete six-character code (%s)", async language => {
  setLanguage(language);
  const shortPayment = { ...payment, id: "7K4M9P" };
  mockApi(shortPayment);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<PaymentForm onClose={vi.fn()} />);
  await screen.findByText("7K4M9P");
  fireEvent.click(screen.getByRole("button", { name: language === "ru" ? "Копировать: Номер заявки" : "Copy: Request number" }));
  expect(writeText).toHaveBeenCalledWith("7K4M9P");
});
