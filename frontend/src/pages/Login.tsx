import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui";
import { apiFetch } from "../lib/api";
import { User } from "../lib/types";

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiFetch<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const me = await apiFetch<User>("/auth/me");
      onLogin(me);
      navigate("/");
    } catch {
      setError("Falha no login. Verifique usuario e senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-page--compact">
      <div className="login-shell login-shell--compact">
        <section className="login-panel login-panel--form login-panel--compact">
          <div className="login-brand login-brand--compact">
            <div className="login-brand__logo">JQ</div>
          </div>

          <div className="login-form__header login-form__header--compact">
            <h2>Entrar</h2>
            <p>Acesse com usuario e senha.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="field">
              <span className="field__label">Usuario</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
                required
                autoFocus
              />
            </label>

            <label className="field">
              <span className="field__label">Senha</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
              />
            </label>

            {error ? <div className="inline-alert inline-alert--error">{error}</div> : null}

            <Button type="submit" size="lg" className="login-form__submit" loading={loading}>
              Entrar
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
