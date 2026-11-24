import type { components } from "@dio/messenger-core";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";

export type ConversationPolicy = components["schemas"]["ConversationPolicyDTO"];
export const policyKey = (conversationId: string) => [
  "conversation-policy",
  conversationId,
];

export function useConversationPolicy(conversationId: string, enabled = true) {
  const { http } = useRuntime();
  return useQuery({
    queryKey: policyKey(conversationId),
    enabled: enabled && !!http,
    queryFn: () =>
      http!.get<ConversationPolicy>(`/v1/conversations/${conversationId}/policy`),
    refetchOnWindowFocus: true,
  });
}
