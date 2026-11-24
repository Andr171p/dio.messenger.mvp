import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";

export interface SearchHit {
  messageId: string;
  conversationId: string;
  snippet: string;
  createdAt: string;
  createdSeq: number;
}

interface ApiSearchHit {
  id: string;
  conversationId: string;
  snippet: string;
  createdAt: string;
  createdSeq: number;
}

interface ApiSearchResult {
  items: ApiSearchHit[];
  limit: number;
}

export function useMessageSearch(query: string, conversationId: string | null) {
  const { http } = useRuntime();

  return useQuery({
    queryKey: ["search", query.trim(), conversationId],
    enabled: !!http && query.trim().length >= 3,
    queryFn: async (): Promise<{ items: SearchHit[]; limit: number }> => {
      const params = new URLSearchParams({ q: query.trim() });
      if (conversationId) params.set("conversationId", conversationId);
      const result = await http!.get<ApiSearchResult>(`/v1/search/messages?${params}`);
      return {
        limit: result.limit,
        items: result.items.map((item) => ({
          messageId: item.id,
          conversationId: item.conversationId,
          snippet: item.snippet,
          createdAt: item.createdAt,
          createdSeq: item.createdSeq,
        })),
      };
    },
  });
}
