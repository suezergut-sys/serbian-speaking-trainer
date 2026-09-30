import { getSupabase } from "./auth";

// This entry point is built only by Vite's explicit testlab mode.
const form = document.querySelector<HTMLFormElement>("#login")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector<HTMLButtonElement>("button")!;
  submit.disabled = true;
  status.textContent = "Вход…";
  try {
    const data = new FormData(form);
    form.reset();
    const { error } = await getSupabase().auth.signInWithPassword({
      email: String(data.get("email")), password: String(data.get("password")),
    });
    if (error) throw error;
    window.location.replace("/?perf");
  } catch {
    status.textContent = "Не удалось войти. Проверьте тестовые данные и запущенную среду.";
    submit.disabled = false;
  }
});
