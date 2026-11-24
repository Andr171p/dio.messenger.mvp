import { Avatar, Button, Icon, type IconName } from "@dio/messenger-ui";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useUiStore, type NavItem } from "../stores/uiStore.js";
import styles from "./AppRail.module.css";

const NAV: { id: NavItem; icon: IconName; label: string }[] = [
  { id: "chats", icon: "chat", label: "Чаты" },
];

export function AppRail() {
  const { session, logout } = useAuth();
  const active = useUiStore((s) => s.navActive);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <nav className={styles.root} aria-label="Навигация DIO Chat">
      <div className={styles.brand} aria-hidden>
        <img
          className={styles.mark}
          src="/brand/dios-mark.png"
          alt=""
          width={28}
          height={28}
        />
      </div>
      <ul className={styles.list}>
        {NAV.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={[styles.navBtn, active === item.id ? styles.active : ""]
                .filter(Boolean)
                .join(" ")}
              title={item.label}
              aria-label={item.label}
              aria-current={active === item.id ? "page" : undefined}
              onClick={() => {
                const ui = useUiStore.getState();
                ui.setSearchPanelOpen(false);
                ui.setMobilePane("list");
              }}
            >
              <Icon name={item.icon} size={20} filled={active === item.id} />
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <Button
          variant="ghost"
          size="sm"
          className={styles.themeBtn}
          aria-label="Сменить тему"
          onClick={toggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
        </Button>
        <Avatar name={session?.displayName ?? "User"} size="sm" />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Выйти из аккаунта"
          onClick={() => void logout()}
        >
          <Icon name="logout" size={18} />
        </Button>
      </div>
    </nav>
  );
}
