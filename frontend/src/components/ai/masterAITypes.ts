import type { MasterAIAction } from '../../services/masterAIService';

export type PendingState = 'open' | 'running' | 'done' | 'cancelled' | 'failed' | 'closed';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  actions?: MasterAIAction[];
  suggestions?: string[];
  timestamp: Date;
  isLoading?: boolean;
  errorDetail?: string;
  /** A plan held for confirmation. Messages reloaded from history have no token. */
  pending?: { token?: string; items: string[] };
  pendingState?: PendingState;
}
