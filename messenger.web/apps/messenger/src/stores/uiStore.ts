import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DioTheme = "light" | "dark";
export type ListCategory = "all" | "direct" | "group";
export type NavItem = "chats" | "people" | "bookmarks" | "settings";

interface ReplyTarget {
  localId: string;
  preview: string;
}

interface UiState {
  theme: DioTheme;
  navActive: NavItem;
  selectedConversationId: string | null;
  contextDrawerOpen: boolean;
  contextResourceId: string | null;
  replyTarget: ReplyTarget | null;
  editingMessageId: string | null;
  listSearch: string;
  listCategory: ListCategory;
  searchPanelOpen: boolean;
  newChatOpen: boolean;
  setTheme: (theme: DioTheme) => void;
  toggleTheme: () => void;
  setNavActive: (nav: NavItem) => void;
  setSelectedConversation: (id: string | null) => void;
  setContextDrawerOpen: (open: boolean) => void;
  setContextResource: (id: string | null) => void;
  setReplyTarget: (target: ReplyTarget | null) => void;
  setEditingMessageId: (id: string | null) => void;
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
      contextDrawerOpen: false,
      contextResourceId: null,
      replyTarget: null,
      editingMessageId: null,
      listSearch: "",
      listCategory: "all",
      searchPanelOpen: false,
      newChatOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === "light" ? "dark" : "light" }),
      setNavActive: (nav) => set({ navActive: nav }),
      setSelectedConversation: (id) => set({ selectedConversationId: id }),
      setContextDrawerOpen: (open) => set({ contextDrawerOpen: open }),
      setContextResource: (id) =>
        set({ contextResourceId: id, contextDrawerOpen: !!id }),
      setReplyTarget: (target) => set({ replyTarget: target }),
      setEditingMessageId: (id) => set({ editingMessageId: id }),
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