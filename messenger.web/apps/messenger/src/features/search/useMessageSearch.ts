import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";

export interface SearchHit {
  messageId: string;
  conversationId: string;
  snippet: string;
  createdAt: string;
}

interface ApiSearchHit {
  id: string;
  conversationId: string;
  snippet: string;
  createdAt: string;
}

interface ApiSearchResult {
  items: ApiSearchHit[];
  limit: number;
}

export function useMessageSearch(query: string) {
  const { http } = useRuntime();

  return useQuery({
    queryKey: ["search", query],
    enabled: !!http && query.trim().length >= 2,
    queryFn: async (): Promise<{ items: SearchHit[]; limit: number }> => {
      const q = encodeURIComponent(query.trim());
      const result = await http!.get<ApiSearchResult>(
        `/v1/search/messages?q=${q}`,
      );
      return {
        limit: result.limit,
        items: result.items.map((item) => ({
          messageId: item.id,
          conversationId: item.conversationId,
          snippet: item.snippet,
          createdAt: item.createdAt,
        })),
      };
    },
  });
}
