import { Avatar, Button, Icon, type IconName } from "@dio/messenger-ui";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useUiStore, type NavItem } from "../stores/uiStore.js";
import styles from "./AppRail.module.css";

const NAV: { id: NavItem; icon: IconName; label: string }[] = [
  { id: "chats", icon: "chat", label: "Чаты" },
  { id: "people", icon: "people", label: "Люди" },
  { id: "bookmarks", icon: "bookmark", label: "Закладки" },
  { id: "settings", icon: "settings", label: "Настройки" },
];

export function AppRail() {
  const { session } = useAuth();
  const active = useUiStore((s) => s.navActive);
  const setActive = useUiStore((s) => s.setNavActive);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <nav className={styles.root} aria-label="Навигация DIO Chat">
      <div className={styles.brand} aria-hidden>
        <Icon name="logo" size={28} title="DIO" />
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
              onClick={() => setActive(item.id)}
            >
              <Icon name={item.icon} size={22} />
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
          ◐
        </Button>
        <Avatar name={session?.displayName ?? "User"} size="sm" />
      </div>
    </nav>
  );
}