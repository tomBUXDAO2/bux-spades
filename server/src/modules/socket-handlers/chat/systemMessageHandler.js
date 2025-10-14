import { gameManager } from '../../../services/GameManager.js';

class SystemMessageHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.gameManager = gameManager;
  }

  // Normalize noisy bot usernames to a short label like "Bot 1"
  shortBotName(rawName, seatIndex) {
    if (typeof seatIndex === 'number') {
      return `Bot ${seatIndex}`;
    }
    if (typeof rawName === 'string') {
      // Match formats like "Bot_bot_1_1759..." or "Bot-1" or "Bot 1"
      const m = rawName.match(/Bot[_-]?bot[_-]?(\d+)/i) || rawName.match(/Bot\s*(\d+)/i);
      if (m && m[1]) return `Bot ${m[1]}`;
    }
    return 'Bot';
  }

  // Send system message to a game
  sendSystemMessage(gameId, message, type = 'info') {
    try {
      console.log(`[SYSTEM MESSAGE] Sending ${type} message to game ${gameId}: ${message}`);
      
      const systemMessage = {
        id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'system',
        message: message,
        messageType: type, // 'info', 'success', 'warning', 'error'
        timestamp: new Date().toISOString(),
        gameId: gameId,
        userId: 'system',
        userName: 'System'
      };

      this.io.to(gameId).emit('system_message', {
        gameId,
        message: systemMessage
      });

      console.log(`[SYSTEM MESSAGE] Broadcasted system message to game ${gameId}`);
      
    } catch (error) {
      console.error('[SYSTEM MESSAGE] Error:', error);
    }
  }

  // Send system message to a specific user
  sendSystemMessageToUser(userId, message, type = 'info') {
    try {
      console.log(`[SYSTEM MESSAGE] Sending ${type} message to user ${userId}: ${message}`);
      
      const systemMessage = {
        id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'system',
        message: message,
        messageType: type,
        timestamp: new Date().toISOString()
      };

      this.socket.to(userId).emit('system_message', {
        message: systemMessage
      });

      console.log(`[SYSTEM MESSAGE] Sent system message to user ${userId}`);
      
    } catch (error) {
      console.error('[SYSTEM MESSAGE] Error:', error);
    }
  }

  // Game event system messages
  handleGameStarted(gameId, game) {
    this.sendSystemMessage(gameId, '🎮 Game has started! Good luck everyone!', 'success');
  }

  handlePlayerJoined(gameId, playerName) {
    this.sendSystemMessage(gameId, `👋 ${playerName} joined the game`, 'info');
  }

  handlePlayerLeft(gameId, playerName) {
    this.sendSystemMessage(gameId, `👋 ${playerName} left the game`, 'warning');
  }

  handlePlayerDisconnected(gameId, playerName) {
    this.sendSystemMessage(gameId, `⚠️ ${playerName} disconnected - will auto-play`, 'warning');
  }

  handleBidMade(gameId, playerName, bid, isNil, isBlindNil) {
    let message = `🎯 ${playerName} bid `;
    if (isBlindNil) {
      message += 'Blind Nil';
    } else if (isNil) {
      message += 'Nil';
    } else {
      message += bid;
    }
    this.sendSystemMessage(gameId, message, 'info');
  }

  handleCardPlayed(gameId, playerName, card) {
    const suitEmojis = {
      'hearts': '♥️',
      'diamonds': '♦️',
      'clubs': '♣️',
      'spades': '♠️'
    };
    const suitEmoji = suitEmojis[card.suit] || card.suit;
    this.sendSystemMessage(gameId, `🃏 ${playerName} played ${card.rank} of ${suitEmoji}`, 'info');
  }

  handleTrickWon(gameId, playerName) {
    this.sendSystemMessage(gameId, `🏆 ${playerName} won the trick!`, 'success');
  }

  handleRoundComplete(gameId, roundNumber, team0Score, team1Score) {
    this.sendSystemMessage(gameId, `📊 Round ${roundNumber} complete! Team 1: ${team0Score}, Team 2: ${team1Score}`, 'info');
  }

  handleGameComplete(gameId, winningTeam, finalScore) {
    this.sendSystemMessage(gameId, `🎉 Game Over! Team ${winningTeam} wins ${finalScore}!`, 'success');
  }

  handleBotAdded(gameId, botName, seatIndex) {
    const label = this.shortBotName(botName, seatIndex);
    this.sendSystemMessage(gameId, `🤖 ${label} joined seat ${seatIndex + 1}`, 'info');
  }

  handleBotRemoved(gameId, botName) {
    const label = this.shortBotName(botName);
    this.sendSystemMessage(gameId, `🤖 ${label} left the game`, 'warning');
  }

  handleError(gameId, errorMessage) {
    this.sendSystemMessage(gameId, `❌ ${errorMessage}`, 'error');
  }
}

export { SystemMessageHandler };
