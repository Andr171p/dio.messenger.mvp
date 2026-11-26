export interface PollState {
  id: string;
  conversationId: string;
  createdBy: string;
  question: string;
  allowsMultiple: boolean;
  allowsRevoting: boolean;
  showVoters: boolean;
  isClosed: boolean;
  totalVoters: number;
  options: { id: string; label: string; voteCount: number }[];
  myOptionIds: string[];
  eventSeq: number;
}

export interface LocalPoll {
  id: string;
  conversationId: string;
  eventSeq: number;
  state?: PollState;
}
