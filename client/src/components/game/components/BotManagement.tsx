import React, { useState } from 'react';
import { useSocket } from '../../features/auth/SocketContext';

interface BotManagementProps {
  gameId: string;
  gameState: any;
  userId: string;
}

const BotManagement: React.FC<BotManagementProps> = ({ gameId, gameState, userId }) => {
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);

  if (!gameState || gameState.status !== 'WAITING') {
    return null; // Only show in waiting state
  }

  const handleAddBot = (seatIndex: number) => {
    if (socket) {
      console.log(`[BOT MANAGEMENT] Adding bot to seat ${seatIndex}`);
      socket.emit('add_bot', { gameId, seatIndex });
    }
  };

  const handleRemoveBot = (seatIndex: number) => {
    if (socket) {
      console.log(`[BOT MANAGEMENT] Removing bot from seat ${seatIndex}`);
      socket.emit('remove_bot', { gameId, seatIndex });
    }
  };

  const handleFillWithBots = () => {
    if (socket) {
      console.log(`[BOT MANAGEMENT] Filling empty seats with bots`);
      socket.emit('fill_with_bots', { gameId });
    }
  };

  const emptySeats = [];
  const botSeats = [];

  for (let i = 0; i < 4; i++) {
    if (!gameState.players[i]) {
      emptySeats.push(i);
    } else if (gameState.players[i].type === 'bot') {
      botSeats.push(i);
    }
  }

  if (emptySeats.length === 0 && botSeats.length === 0) {
    return null; // No empty seats and no bots
  }

  return (
    <div className="bot-management">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bot-toggle-btn"
        style={{
          padding: '8px 12px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          margin: '4px'
        }}
      >
        {isOpen ? 'Hide' : 'Manage'} Bots ({botSeats.length} bots, {emptySeats.length} empty)
      </button>

      {isOpen && (
        <div className="bot-controls" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
          minWidth: '200px'
        }}>
          <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            Bot Management
          </div>
          
          {emptySeats.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', marginBottom: '4px' }}>Empty Seats:</div>
              {emptySeats.map(seatIndex => (
                <button
                  key={seatIndex}
                  onClick={() => handleAddBot(seatIndex)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    margin: '2px'
                  }}
                >
                  Add Bot to Seat {seatIndex + 1}
                </button>
              ))}
            </div>
          )}

          {botSeats.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', marginBottom: '4px' }}>Bot Seats:</div>
              {botSeats.map(seatIndex => (
                <button
                  key={seatIndex}
                  onClick={() => handleRemoveBot(seatIndex)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    margin: '2px'
                  }}
                >
                  Remove Bot from Seat {seatIndex + 1}
                </button>
              ))}
            </div>
          )}

          {emptySeats.length > 1 && (
            <button
              onClick={handleFillWithBots}
              style={{
                padding: '6px 12px',
                backgroundColor: '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                width: '100%'
              }}
            >
              Fill All Empty Seats ({emptySeats.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BotManagement;
