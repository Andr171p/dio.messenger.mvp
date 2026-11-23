import { useEffect } from "react";
import { MessengerLayout } from "../app/layouts/MessengerLayout.js";
import { MessageComposer } from "../features/composer/MessageComposer.js";
import { useUiStore } from "../stores/uiStore.js";
import { AppRail } from "../widgets/AppRail.js";
import { ChatHeader } from "../widgets/ChatHeader.js";
import { ContextResourcePanel } from "../widgets/ContextResourcePanel.js";
import { ConversationList } from "../widgets/ConversationList.js";
import { GlobalSearchPanel } from "../widgets/GlobalSearchPanel.js";
import { MessageTimeline } from "../widgets/MessageTimeline.js";
import { NewChatModal } from "../widgets/NewChatModal.js";
import { OfflineIndicator } from "../widgets/OfflineIndicator.js";
import styles from "./MessengerShellPage.module.css";

export function MessengerShellPage() {
  const theme = useUiStore((s) => s.theme);
  const contextOpen = useUiStore((s) => s.contextDrawerOpen);

  useEffect(() => {
    document.documentElement.setAttribute("data-dio-theme", theme);
  }, [theme]);

  return (
    <>
      <GlobalSearchPanel />
      <NewChatModal />
      <MessengerLayout
        contextOpen={contextOpen}
        rail={<AppRail />}
        list={<ConversationList />}
        chat={
          <div className={styles.chatColumn}>
            <ChatHeader />
            <MessageTimeline />
            <MessageComposer />
          </div>
        }
        context={<ContextResourcePanel />}
        statusBar={<OfflineIndicator />}
      />
    </>
  );
}