import { useEffect } from "react";
import { MessengerLayout } from "../app/layouts/MessengerLayout.js";
import { MessageComposer } from "../features/composer/MessageComposer.js";
import { useUiStore } from "../stores/uiStore.js";
import { AppRail } from "../widgets/AppRail.js";
import { ChatHeader } from "../widgets/ChatHeader.js";
import { ContextResourcePanel } from "../widgets/ContextResourcePanel.js";
import { ConversationList } from "../widgets/ConversationList.js";
import { ForwardModal } from "../widgets/ForwardModal.js";
import { GlobalSearchPanel } from "../widgets/GlobalSearchPanel.js";
import { MessageTimeline } from "../widgets/MessageTimeline.js";
import { NewChatModal } from "../widgets/NewChatModal.js";
import { OfflineIndicator } from "../widgets/OfflineIndicator.js";
import { PinBar } from "../widgets/PinBar.js";
import styles from "./MessengerShellPage.module.css";

export function MessengerShellPage() {
  const theme = useUiStore((s) => s.theme);
  const contextOpen = useUiStore((s) => s.contextDrawerOpen);
  const mobilePane = useUiStore((s) => s.mobilePane);

  useEffect(() => {
    document.documentElement.setAttribute("data-dio-theme", theme);
  }, [theme]);

  return (
    <>
      <GlobalSearchPanel />
      <NewChatModal />
      <ForwardModal />
      <MessengerLayout
        mobilePane={mobilePane}
        contextOpen={contextOpen}
        rail={<AppRail />}
        list={<ConversationList />}
        chat={
          <div className={[styles.chatColumn, "dio-chat-canvas"].join(" ")}>
            <ChatHeader />
            <OfflineIndicator />
            <PinBar />
            <MessageTimeline />
            <MessageComposer />
          </div>
        }
        context={<ContextResourcePanel />}
      />
    </>
  );
}
