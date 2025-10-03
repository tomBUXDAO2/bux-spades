import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../../features/auth/SocketContext';
import { useAuth } from '../../../features/auth/AuthContext';

interface GameChatProps {
  gameId: string;
  gameState: any;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  timestamp: string;
  type?: 'user' | 'system';
  messageType?: 'info' | 'success' | 'warning' | 'error';
}

const GameChat: React.FC<GameChatProps> = ({ gameId, gameState }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket || !gameId) return;

    // Request existing messages when component mounts
    socket.emit('get_game_messages', { gameId, limit: 50 });

    const handleGameMessage = (event: CustomEvent) => {
      const { gameId: eventGameId, message } = event.detail;
      if (eventGameId === gameId) {
        setMessages(prev => [...prev, { ...message, type: 'user' }]);
      }
    };

    const handleGameMessages = (event: CustomEvent) => {
      const { gameId: eventGameId, messages: newMessages } = event.detail;
      if (eventGameId === gameId) {
        setMessages(newMessages.map((msg: any) => ({ ...msg, type: 'user' })));
      }
    };

    const handleSystemMessage = (event: CustomEvent) => {
      const { gameId: eventGameId, message } = event.detail;
      if (eventGameId === gameId) {
        setMessages(prev => [...prev, { ...message, type: 'system' }]);
      }
    };

    window.addEventListener('gameMessage', handleGameMessage as EventListener);
    window.addEventListener('gameMessages', handleGameMessages as EventListener);
    window.addEventListener('systemMessage', handleSystemMessage as EventListener);

    return () => {
      window.removeEventListener('gameMessage', handleGameMessage as EventListener);
      window.removeEventListener('gameMessages', handleGameMessages as EventListener);
      window.removeEventListener('systemMessage', handleSystemMessage as EventListener);
    };
  }, [socket, gameId]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    socket.emit('game_message', {
      gameId,
      message: newMessage.trim()
    });

    setNewMessage('');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageStyle = (message: ChatMessage) => {
    if (message.type === 'system') {
      const baseStyle = {
        padding: '4px 8px',
        margin: '2px 0',
        borderRadius: '4px',
        fontSize: '12px',
        fontStyle: 'italic'
      };

      switch (message.messageType) {
        case 'success':
          return { ...baseStyle, backgroundColor: '#d4edda', color: '#155724' };
        case 'warning':
          return { ...baseStyle, backgroundColor: '#fff3cd', color: '#856404' };
        case 'error':
          return { ...baseStyle, backgroundColor: '#f8d7da', color: '#721c24' };
        default:
          return { ...baseStyle, backgroundColor: '#e2e3e5', color: '#383d41' };
      }
    }

    return {
      padding: '4px 8px',
      margin: '2px 0',
      borderRadius: '4px',
      fontSize: '12px',
      backgroundColor: message.userId === user?.id ? '#007bff' : '#f8f9fa',
      color: message.userId === user?.id ? 'white' : 'black'
    };
  };

  return (
    <div className="game-chat" style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 12px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          margin: '4px'
        }}
      >
        {isOpen ? 'Hide' : 'Show'} Chat ({messages.length})
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
          width: '300px',
          height: '400px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            maxHeight: '320px'
          }}>
            {messages.map((message) => (
              <div key={message.id} style={getMessageStyle(message)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>
                    {message.type === 'system' ? '🔔 System' : message.userName}
                  </span>
                  <span style={{ fontSize: '10px', opacity: 0.7 }}>
                    {formatTimestamp(message.timestamp)}
                  </span>
                </div>
                <div>{message.message}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} style={{
            padding: '8px',
            borderTop: '1px solid #eee',
            display: 'flex'
          }}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: '4px 8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              style={{
                padding: '4px 8px',
                marginLeft: '4px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default GameChat;
