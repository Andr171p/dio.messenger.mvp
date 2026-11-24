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
import { GuestConversationNotice } from "../widgets/GuestConversationNotice.js";
import { MessageTimeline } from "../widgets/MessageTimeline.js";
import { NewChatModal } from "../widgets/NewChatModal.js";
import { OfflineIndicator } from "../widgets/OfflineIndicator.js";
import { PinBar } from "../widgets/PinBar.js";
import styles from "./MessengerShellPage.module.css";

function closeContext() {
  const ui = useUiStore.getState();
  ui.setContextResource(null);
  ui.setMobilePane("chat");
}

export function MessengerShellPage() {
  const theme = useUiStore((s) => s.theme);
  const contextOpen = useUiStore((s) => s.contextDrawerOpen);
  const mobilePane = useUiStore((s) => s.mobilePane);
  const searchOpen = useUiStore((s) => s.searchPanelOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useUiStore.getState().setSearchPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-dio-theme", theme);
  }, [theme]);

  return (
    <>
      <NewChatModal />
      <ForwardModal />
      <MessengerLayout
        mobilePane={mobilePane}
        contextOpen={contextOpen}
        onCloseContext={closeContext}
        rail={<AppRail />}
        list={searchOpen ? <GlobalSearchPanel /> : <ConversationList />}
        chat={
          <div className={[styles.chatColumn, "dio-chat-canvas"].join(" ")}>
            <ChatHeader />
            <OfflineIndicator />
            <GuestConversationNotice />
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
