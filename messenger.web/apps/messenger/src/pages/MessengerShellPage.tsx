import { useEffect } from "react";
import { MessengerLayout } from "../app/layouts/MessengerLayout.js";
import { MessageComposer } from "../features/composer/MessageComposer.js";
import { useUiStore } from "../stores/uiStore.js";
import { AppRail } from "../widgets/AppRail.js";
import { useLiveQuery } from "dexie-react-hooks";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { TopicList, useGroupTopics } from "../widgets/GroupTopics.js";
import { ChatHeader } from "../widgets/ChatHeader.js";
import { ContextResourcePanel } from "../widgets/ContextResourcePanel.js";
import { ConversationList } from "../widgets/ConversationList.js";
import { ForwardModal } from "../widgets/ForwardModal.js";
import { GlobalSearchPanel } from "../widgets/GlobalSearchPanel.js";
import { GuestConversationNotice } from "../widgets/GuestConversationNotice.js";
import { MessageTimeline } from "../widgets/MessageTimeline.js";
import { NewChatModal } from "../widgets/NewChatModal.js";
import { OfflineIndicator } from "../widgets/OfflineIndicator.js";
import { ProfileDialog } from "../widgets/ProfileDialog.js";
import { PinBar } from "../widgets/PinBar.js";
import styles from "./MessengerShellPage.module.css";

function closeContext() {
  const ui = useUiStore.getState();
  ui.setContextResource(null);
  ui.setMobilePane("chat");
}

export function MessengerShellPage() {
  const mentionProfileId = useUiStore((s) => s.mentionProfileId);
  const setMentionProfile = useUiStore((s) => s.setMentionProfile);
  const selected = useUiStore((s) => s.selectedConversationId);
  const topicsOpen = useUiStore((s) => s.topicsOpen);
  const { db } = useRuntime();
  const chat = useLiveQuery(
    () => (selected && db ? db.conversations.get(selected) : undefined),
    [db, selected],
  );
  const topics = useGroupTopics(
    chat && chat.id === selected && chat.kind === "group" ? selected : null,
  );
  const groupId = selected && (topicsOpen || topics.data?.length) ? selected : null;
  const thread = useUiStore((s) => s.selectedThreadId);
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
      {mentionProfileId && (
        <ProfileDialog
          key={mentionProfileId}
          initial={{ id: mentionProfileId }}
          onClose={() => setMentionProfile(undefined)}
        />
      )}
      <NewChatModal />
      <ForwardModal />
      <MessengerLayout
        mobilePane={mobilePane}
        contextOpen={contextOpen}
        onCloseContext={closeContext}
        rail={groupId && !searchOpen ? <ConversationList compact /> : <AppRail />}
        list={
          searchOpen ? (
            <GlobalSearchPanel />
          ) : groupId ? (
            <TopicList key={groupId} conversationId={groupId} />
          ) : (
            <ConversationList />
          )
        }
        chat={
          <div className={[styles.chatColumn, "dio-chat-canvas"].join(" ")}>
            <ChatHeader />
            <OfflineIndicator />
            <GuestConversationNotice />
            <PinBar />
            <MessageTimeline key={thread ?? "main"} />
            <MessageComposer />
          </div>
        }
        context={<ContextResourcePanel />}
      />
    </>
  );
}
