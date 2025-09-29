export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  message: string;
  timestamp: string;
  isSystemMessage?: boolean;
}

export interface GameChatMessage extends ChatMessage {
  gameId: string;
}

export interface LobbyChatMessage extends ChatMessage {
  // Lobby-specific properties can be added here
}
