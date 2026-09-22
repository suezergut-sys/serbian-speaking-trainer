import { useEffect, useState } from "react";

import { fetchAdminUsers } from "./api/users";
import type { AdminUser } from "./types/auth";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function AdminUsersView() {
  const [users, setUsers] = useState<AdminUser[]>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdminUsers(controller.signal).then(setUsers).catch((requestError: unknown) => {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(true);
    });
    return () => controller.abort();
  }, []);

  return <main className="admin-page">
    <header className="statistics-header"><div><p className="kicker">Только для администратора</p><h1>Пользователи</h1><span>Регистрация, последняя активность и использование дневного лимита.</span></div></header>
    <section className="admin-users panel">
      {error ? <p className="error" role="alert">Не удалось загрузить пользователей.</p> : !users ? <p>Загружаем пользователей…</p> :
        <div className="phrase-table-wrap"><table className="phrase-table">
          <thead><tr><th>Аккаунт</th><th>Роль</th><th>Регистрация</th><th>Последняя активность</th><th>Фраз сегодня</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}>
            <td><strong>{user.display_name || "Без имени"}</strong><br/><small>{user.email}</small></td>
            <td>{user.role === "admin" ? "Администратор" : "Пользователь"}</td>
            <td>{formatDate(user.registered_at)}</td><td>{formatDate(user.last_active_at)}</td>
            <td>{user.role === "admin" || user.access_tier === "premium" ? `${user.phrases_today} · без лимита` : `${user.phrases_today} / 10`}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </main>;
}
