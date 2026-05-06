import { useEffect, useState } from "react";
import { fetchAuthMe } from "./api";
import type { AuthUser } from "./api";
import AdminView from "./AdminView";
import { useT } from "./i18n";

export default function AdminPage() {
  const t = useT();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuthMe()
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="adminPage">
      <header className="adminHeader">
        <div className="adminHeaderBrand">
          <span className="topName">crash_site</span>
          <span className="adminHeaderTag">ADMIN</span>
        </div>
        <div className="adminHeaderRight">
          {user && <span className="adminHeaderUser">{user.displayName}</span>}
          <button className="ghostBtn" onClick={() => window.close()} title="Zamknij">✕</button>
        </div>
      </header>

      <main className="adminMain">
        {loading ? (
          <p className="adminLoading">…</p>
        ) : !user ? (
          <p className="error" style={{ margin: 24 }}>{t("admin_forbidden")}</p>
        ) : (
          <AdminView user={user} />
        )}
      </main>
    </div>
  );
}
