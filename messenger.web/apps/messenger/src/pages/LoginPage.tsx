import { Button, Input } from "@dio/messenger-ui";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider.js";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const { login, isAuthenticated, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-dio-theme", "light");
  }, []);

  if (!ready) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <img
          src="/brand/dios-mark.png"
          alt="DIO"
          width={40}
          height={40}
          className={styles.logo}
        />
        <span>DIO</span>
      </div>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1 className={styles.title}>DIO Messenger</h1>
        <p className={styles.subtitle}>Войдите с учётной записью DIO Desk</p>
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Пароль"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button type="submit" loading={loading} className={styles.submit}>
          Войти
        </Button>
      </form>
    </div>
  );
}
