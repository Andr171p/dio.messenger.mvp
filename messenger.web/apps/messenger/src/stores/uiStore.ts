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
  mobilePane: MobilePane;
  contextDrawerOpen: boolean;
  contextResourceId: string | null;
  /** UUID for API preview when available */
  contextResourceUuid: string | null;
  replyTarget: ReplyTarget | null;
  editingMessageId: string | null;
  forwardTarget: ForwardTarget | null;
  listSearch: string;
  listCategory: ListCategory;
  searchPanelOpen: boolean;
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
  setListSearch: (value: string) => void;
  setListCategory: (category: ListCategory) => void;
  setSearchPanelOpen: (open: boolean) => void;
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
      listSearch: "",
      listCategory: "all",
      searchPanelOpen: false,
      newChatOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === "light" ? "dark" : "light" }),
      setNavActive: (nav) => set({ navActive: nav }),
      setSelectedConversation: (id) =>
        set({
          selectedConversationId: id,
          replyTarget: null,
          editingMessageId: null,
          forwardTarget: null,
          mobilePane: id ? "chat" : "list",
        }),
      setMobilePane: (pane) => set({ mobilePane: pane }),
      setContextDrawerOpen: (open) => set({ contextDrawerOpen: open }),
      setContextResource: (id, uuid = null) =>
        set({
          contextResourceId: id,
          contextResourceUuid: uuid,
          contextDrawerOpen: !!id,
          mobilePane: id ? "context" : get().mobilePane,
        }),
      setReplyTarget: (target) => set({ replyTarget: target, editingMessageId: null }),
      setEditingMessageId: (id) => set({ editingMessageId: id, replyTarget: null }),
      setForwardTarget: (target) => set({ forwardTarget: target }),
      setListSearch: (value) => set({ listSearch: value }),
      setListCategory: (category) => set({ listCategory: category }),
      setSearchPanelOpen: (open) => set({ searchPanelOpen: open }),
      setNewChatOpen: (open) => set({ newChatOpen: open }),
    }),
    {
      name: "dio-messenger-ui",
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
