import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DioTheme = "light" | "dark";
export type ListCategory = "all" | "direct" | "group";
export type NavItem = "chats" | "people" | "bookmarks" | "settings";
export type MobilePane = "list" | "chat" | "context";

interface ReplyTarget {
  localId: string;
  serverId?: string;
  preview: string;
  quoteText?: string;
}

interface ForwardTarget {
  localId: string;
  serverId?: string;
  preview: string;
  conversationId: string;
}

interface UiState {
  theme: DioTheme;
  navActive: NavItem;
  selectedConversationId: string | null;
  mentionProfileId?: string;
  setMentionProfile: (id?: string) => void;
  mutedChats: Record<string, boolean>;
  toggleChatMute: (key: string) => void;
  topicsOpen: boolean;
  setTopicsOpen: (open: boolean) => void;
  selectedThreadId?: string;
  setThread: (id?: string) => void;
  mobilePane: MobilePane;
  contextDrawerOpen: boolean;
  contextResourceId: string | null;
  /** UUID for API preview when available */
  contextResourceUuid: string | null;
  replyTarget: ReplyTarget | null;
  editingMessageId: string | null;
  forwardTarget: ForwardTarget | null;
  listCategory: ListCategory;
  searchPanelOpen: boolean;
  searchConversationId: string | null;
  messageTarget: { id: string; seq?: number } | null;
  newChatOpen: boolean;
  setTheme: (theme: DioTheme) => void;
  toggleTheme: () => void;
  setNavActive: (nav: NavItem) => void;
  setSelectedConversation: (id: string | null) => void;
  setMobilePane: (pane: MobilePane) => void;
  setContextDrawerOpen: (open: boolean) => void;
  setContextResource: (id: string | null, uuid?: string | null) => void;
  setReplyTarget: (target: ReplyTarget | null) => void;
  setEditingMessageId: (id: string | null) => void;
  setForwardTarget: (target: ForwardTarget | null) => void;
  setListCategory: (category: ListCategory) => void;
  setSearchPanelOpen: (open: boolean, conversationId?: string) => void;
  setMessageTarget: (target: UiState["messageTarget"]) => void;
  setNewChatOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      navActive: "chats",
      selectedConversationId: null,
      mobilePane: "list",
      contextDrawerOpen: false,
      contextResourceId: null,
      contextResourceUuid: null,
      replyTarget: null,
      editingMessageId: null,
      forwardTarget: null,
      listCategory: "all",
      searchPanelOpen: false,
      searchConversationId: null,
      messageTarget: null,
      newChatOpen: false,
      setMentionProfile: (mentionProfileId) => set({ mentionProfileId }),
      mutedChats: {},
      toggleChatMute: (key) =>
        set((state) => ({
          mutedChats: { ...state.mutedChats, [key]: !state.mutedChats[key] },
        })),
      topicsOpen: false,
      setTopicsOpen: (topicsOpen) =>
        set({ topicsOpen, searchPanelOpen: false, mobilePane: "list" }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
      setNavActive: (nav) => set({ navActive: nav }),
      setThread: (selectedThreadId) =>
        set({
          selectedThreadId,
          mobilePane: "chat",
          editingMessageId: null,
          replyTarget: null,
          messageTarget: null,
        }),
      setSelectedConversation: (id) =>
        set({
          selectedConversationId: id,
          mentionProfileId: undefined,
          topicsOpen: false,
          selectedThreadId: undefined,
          replyTarget: null,
          editingMessageId: null,
          forwardTarget: null,
          contextDrawerOpen: false,
          contextResourceId: null,
          contextResourceUuid: null,
          messageTarget: null,
          mobilePane: id ? "chat" : "list",
        }),
      setMobilePane: (pane) => set({ mobilePane: pane }),
      setContextDrawerOpen: (open) => set({ contextDrawerOpen: open }),
      setContextResource: (id, uuid = null) =>
        set({
          contextResourceId: id,
          contextResourceUuid: uuid,
          contextDrawerOpen: !!id,
          mobilePane: id ? "context" : get().selectedConversationId ? "chat" : "list",
        }),
      setReplyTarget: (target) => set({ replyTarget: target, editingMessageId: null }),
      setEditingMessageId: (id) => set({ editingMessageId: id, replyTarget: null }),
      setForwardTarget: (target) => set({ forwardTarget: target }),
      setListCategory: (category) => set({ listCategory: category }),
      setSearchPanelOpen: (open, conversationId) =>
        set({
          searchPanelOpen: open,
          searchConversationId: conversationId ?? null,
          mobilePane: open ? "list" : get().selectedConversationId ? "chat" : "list",
          ...(open
            ? {
                contextDrawerOpen: false,
                contextResourceId: null,
                contextResourceUuid: null,
              }
            : {}),
        }),
      setMessageTarget: (messageTarget) => set({ messageTarget }),
      setNewChatOpen: (open) => set({ newChatOpen: open }),
    }),
    {
      name: "dio-messenger-ui",
      partialize: (state) => ({ mutedChats: state.mutedChats, theme: state.theme }),
    },
  ),
);
