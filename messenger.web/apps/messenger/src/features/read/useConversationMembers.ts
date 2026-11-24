import type { components } from "@dio/messenger-core";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";

export function useConversationMembers(conversationId: string | null) {
  const { http } = useRuntime();
  return useQuery({
    queryKey: ["conversation-members", conversationId],
    enabled: !!http && !!conversationId,
    refetchInterval: 15_000,
    queryFn: () =>
      http!.get<components["schemas"]["ConversationMemberDTO"][]>(
        `/v1/conversations/${conversationId}/members`,
      ),
  });
}

export function useDirectoryProfiles(enabled: boolean) {
  const { http } = useRuntime();
  return useQuery({
    queryKey: ["directory-profiles"],
    enabled: !!http && enabled,
    staleTime: 120_000,
    queryFn: async () => {
      const users = await http!.get<components["schemas"]["InviteCatalogUserDTO"][]>(
        "/v1/directory/users?size=100",
      );
      return Object.fromEntries(
        users.map((user) => [user.id, user.fullName || user.username || user.email]),
      );
    },
  });
}
