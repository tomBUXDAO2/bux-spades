import { prisma } from '../config/database.js';

/**
 * DATABASE-FIRST GAME ENGINE
 * Single source of truth: PostgreSQL database
 * No in-memory state - everything is computed from DB
 */
export class DatabaseGameEngine {
  
  /**
   * Get complete game state from database
   * This is the ONLY way to get game state
   */
  static async getGameState(gameId) {
    try {
      // Get main game record
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      // OPTIMIZED: Get players with user info in single query (fixes N+1 problem)
      const playersWithUsers = await prisma.gamePlayer.findMany({
        where: { gameId },
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true }
          }
        },
        orderBy: { seatIndex: 'asc' }
      });

      // OPTIMIZED: Get rounds with all related data in optimized queries
      const rounds = await prisma.round.findMany({
        where: { gameId },
        include: {
          tricks: {
            include: {
              cards: {
                orderBy: { playOrder: 'asc' }
              }
            },
            orderBy: { trickNumber: 'asc' }
          },
          playerStats: true,
          RoundScore: true
        },
        orderBy: { roundNumber: 'asc' }
      });

      // Get result if exists
      const result = await prisma.gameResult.findUnique({
        where: { gameId }
      });

      const gameWithData = {
        ...game,
        players: playersWithUsers,
        rounds: rounds, // Now includes all related data
        result
      };

      return this.computeGameState(gameWithData);
    } catch (error) {
      console.error('[DB GAME ENGINE] Error getting game state:', error);
      throw error;
    }
  }

  /**
   * Compute complete game state from database records
   */
  static computeGameState(game) {
    const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
    const currentTrick = currentRound?.tricks.find(t => t.trickNumber === game.currentTrick);
    
    // Compute player hands from cards played
    const playerHands = this.computePlayerHands(game);
    
    // Compute current player (who should play next)
    const currentPlayer = this.computeCurrentPlayer(game, currentTrick);
    
    // Compute game status
    const status = this.computeGameStatus(game);
    
    // Get current trick cards
    const currentTrickCards = currentTrick?.cards || [];
    
    // Get bids for current round
    const currentBids = currentRound?.bids || [];
    const bids = [null, null, null, null];
    currentBids.forEach(bid => {
      const player = game.players.find(p => p.userId === bid.userId);
      if (player) {
        bids[player.seatIndex] = bid.bid;
      }
    });
    
    return {
      id: game.id,
      status,
      mode: game.mode,
      format: game.format,
      maxPoints: game.maxPoints,
      minPoints: game.minPoints,
      buyIn: game.buyIn,
      currentRound: game.currentRound,
      currentTrick: game.currentTrick,
      currentPlayer,
      dealer: game.dealer,
      players: game.players.filter(player => !player.isSpectator).map((player, index) => ({
        ...player,
        hand: playerHands[index] || [],
        position: player.seatIndex,
        seatIndex: player.seatIndex,
        team: player.teamIndex,
        type: player.isHuman ? 'human' : 'bot',
        bid: bids[player.seatIndex] || null,
        tricks: 0, // TODO: Calculate from player stats
        points: 0, // TODO: Calculate from player stats
        connected: true,
        userId: player.userId, // Ensure userId is preserved
        username: player.user?.username,
        avatarUrl: player.user?.avatarUrl
      })),
      spectators: game.players.filter(player => player.isSpectator).map(player => ({
        ...player,
        type: player.isHuman ? 'human' : 'bot',
        connected: true,
        userId: player.userId,
        username: player.user?.username,
        avatarUrl: player.user?.avatarUrl
      })),
      hands: playerHands, // Client expects this at root level
      play: {
        currentPlayer,
        currentPlayerIndex: game.players.findIndex(p => p.userId === currentPlayer),
        currentTrick: currentTrickCards,
        tricks: [], // TODO: Build from completed tricks
        trickNumber: game.currentTrick,
        spadesBroken: false // TODO: Calculate from played cards
      },
      bidding: {
        bids,
        currentBidderIndex: 0, // TODO: Calculate current bidder
        currentPlayer: currentPlayer
      },
      rounds: game.rounds,
      currentRoundData: currentRound,
      currentTrickData: currentTrick,
      result: game.result,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt
    };
  }

  /**
   * Compute player hands by subtracting played cards from dealt cards
   */
  static computePlayerHands(game) {
    const hands = [[], [], [], []];
    
    // For WAITING games, return empty hands
    if (game.status === 'WAITING') {
      return hands;
    }
    
    // Get all cards played in this round
    const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
    if (!currentRound) return hands;
    
    const playedCards = currentRound.tricks.flatMap(trick => 
      trick.cards.map(card => ({
        seatIndex: card.seatIndex,
        suit: card.suit,
        rank: card.rank
      }))
    );
    
    // Get dealt hands from game state (if available)
    const gameState = game.gameState || {};
    const dealtHands = gameState.hands || [[], [], [], []];
    
    // Subtract played cards from dealt hands
    for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
      const playedBySeat = playedCards.filter(c => c.seatIndex === seatIndex);
      const dealtHand = dealtHands[seatIndex] || [];
      
      hands[seatIndex] = dealtHand.filter(dealtCard => 
        !playedBySeat.some(playedCard => 
          playedCard.suit === dealtCard.suit && playedCard.rank === dealtCard.rank
        )
      );
    }
    
    return hands;
  }

  /**
   * Determine who should play next
   */
  static computeCurrentPlayer(game, currentTrick) {
    if (!currentTrick) {
      // No current trick, game might be in bidding phase
      return game.currentPlayer;
    }
    
    // Count cards in current trick
    const cardCount = currentTrick.cards.length;
    
    if (cardCount === 0) {
      // No cards played yet, winner of previous trick leads
      return currentTrick.leadSeatIndex;
    }
    
    if (cardCount >= 4) {
      // Trick is complete, should trigger completion
      return null;
    }
    
    // Next player in rotation (clockwise)
    const lastPlayedCard = currentTrick.cards[currentTrick.cards.length - 1];
    return (lastPlayedCard.seatIndex + 1) % 4;
  }

  /**
   * Compute game status based on database state
   */
  static computeGameStatus(game) {
    if (game.status === 'FINISHED') return 'FINISHED';
    if (game.status === 'WAITING') return 'WAITING';
    
    const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
    if (!currentRound) return 'PLAYING';
    
    // Check if round is complete (13 tricks played)
    const tricksPlayed = currentRound.tricks.filter(t => t.winningSeatIndex !== -1).length;
    if (tricksPlayed >= 13) {
      // Round complete, check if game is complete
      if (game.currentRound >= 13 || this.isGameComplete(game)) {
        return 'FINISHED';
      }
      return 'PLAYING'; // Round complete, game continues
    }
    
    return 'PLAYING';
  }

  /**
   * Check if game is complete based on scores
   */
  static isGameComplete(game) {
    // This would check if any team has reached maxPoints or minPoints
    // Implementation depends on scoring logic
    return false;
  }

  /**
   * Play a card - ALL game logic in database transactions
   */
  static async playCard(gameId, userId, seatIndex, card) {
    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Get current game state
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          rounds: {
            include: {
              tricks: {
                include: {
                  cards: {
                    orderBy: { playOrder: 'asc' }
                  }
                },
                orderBy: { trickNumber: 'asc' }
              }
            },
            orderBy: { roundNumber: 'asc' }
          }
        }
      });

      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'PLAYING') {
        throw new Error('Game is not in playing state');
      }

      // 2. Find current round and trick
      const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
      if (!currentRound) {
        throw new Error('Current round not found');
      }

      let currentTrick = currentRound.tricks.find(t => t.trickNumber === game.currentTrick);
      
      // 3. Check if trick needs to be completed first
      if (currentTrick && currentTrick.cards.length >= 4) {
        // Complete the trick first
        const winner = this.determineTrickWinner(currentTrick.cards);
        
        // Update trick winner
        await tx.trick.update({
          where: { id: currentTrick.id },
          data: { winningSeatIndex: winner }
        });

        // Update player stats
        await tx.playerRoundStats.updateMany({
          where: { 
            roundId: currentRound.id,
            seatIndex: winner
          },
          data: {
            tricksWon: { increment: 1 }
          }
        });

        // Check if round is complete
        const tricksCompleted = await tx.trick.count({
          where: { 
            roundId: currentRound.id,
            winningSeatIndex: { not: -1 }
          }
        });

        if (tricksCompleted >= 13) {
          // Round complete - calculate scores and start next round
          await this.completeRound(tx, gameId, currentRound.id);
          return { action: 'round_complete', winner, nextRound: game.currentRound + 1 };
        } else {
          // Start next trick
          const nextTrickNumber = game.currentTrick + 1;
          const newTrick = await tx.trick.create({
            data: {
              id: `trick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              roundId: currentRound.id,
              trickNumber: nextTrickNumber,
              leadSeatIndex: winner,
              winningSeatIndex: -1,
              createdAt: new Date()
            }
          });

          // Update game current trick
          // Find the winning player's userId
          const winningPlayer = game.players.find(p => p.seatIndex === winner);
          await tx.game.update({
            where: { id: gameId },
            data: { 
              currentTrick: nextTrickNumber,
              currentPlayer: winningPlayer?.userId
            }
          });

          currentTrick = newTrick;
        }
      }

      // 4. Validate card play
      if (!(await this.isValidCardPlay(gameId, seatIndex, card, currentTrick))) {
        throw new Error('Invalid card play');
      }

      // 5. Play the card
      const playOrder = currentTrick.cards.length;
      const trickCard = await tx.trickCard.create({
        data: {
          trickId: currentTrick.id,
          seatIndex,
          suit: card.suit,
          rank: card.rank,
          playOrder,
          playedAt: new Date()
        }
      });

      // 6. Update game state
      const nextPlayer = (seatIndex + 1) % 4;
      await tx.game.update({
        where: { id: gameId },
        data: { 
          currentPlayer: nextPlayer,
          lastActionAt: new Date()
        }
      });

      return { 
        action: 'card_played', 
        trickCard,
        nextPlayer,
        currentTrick: currentTrick.id
      };
    });

    return transaction;
  }

  /**
   * Determine trick winner based on spades rules
   */
  static determineTrickWinner(cards) {
    if (cards.length !== 4) {
      throw new Error('Trick must have exactly 4 cards');
    }

    const leadSuit = cards[0].suit;
    let winner = cards[0];
    let winnerIndex = 0;

    for (let i = 1; i < cards.length; i++) {
      const card = cards[i];
      
      // Spades always win
      if (card.suit === 'SPADES' && winner.suit !== 'SPADES') {
        winner = card;
        winnerIndex = i;
        continue;
      }
      
      // If both are spades, higher rank wins
      if (card.suit === 'SPADES' && winner.suit === 'SPADES') {
        if (this.cardRankValue(card.rank) > this.cardRankValue(winner.rank)) {
          winner = card;
          winnerIndex = i;
        }
        continue;
      }
      
      // If neither is spades, must follow suit and higher rank wins
      if (card.suit === leadSuit && winner.suit === leadSuit) {
        if (this.cardRankValue(card.rank) > this.cardRankValue(winner.rank)) {
          winner = card;
          winnerIndex = i;
        }
      }
    }

    return cards[winnerIndex].seatIndex;
  }

  /**
   * Get card rank value for comparison
   */
  static cardRankValue(rank) {
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  }

  /**
   * Get a player's current hand
   */
  static async getPlayerHand(gameId, seatIndex) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { rounds: { include: { tricks: { include: { cards: true } } } } }
      });
      
      if (!game) return [];
      
      // Get dealt cards from game state
      const gameState = game.gameState || {};
      const dealtHand = gameState.hands?.[seatIndex] || [];
      
      // Get played cards from current round
      const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
      if (!currentRound) return dealtHand;
      
      const playedCards = currentRound.tricks.flatMap(trick => 
        trick.cards.filter(card => card.seatIndex === seatIndex)
      );
      
      // Subtract played cards from dealt hand
      const currentHand = dealtHand.filter(dealtCard => 
        !playedCards.some(playedCard => 
          playedCard.suit === dealtCard.suit && playedCard.rank === dealtCard.rank
        )
      );
      
      return currentHand;
    } catch (error) {
      console.error('[DATABASE GAME ENGINE] Error getting player hand:', error);
      return [];
    }
  }

  /**
   * Validate if card play is legal
   */
  static async isValidCardPlay(gameId, seatIndex, card, currentTrick) {
    // Basic validation
    if (!currentTrick) return false;
    if (currentTrick.cards.length >= 4) return false;
    
    // Check if it's the player's turn
    const expectedPlayer = currentTrick.cards.length === 0 
      ? currentTrick.leadSeatIndex 
      : (currentTrick.cards[currentTrick.cards.length - 1].seatIndex + 1) % 4;
    
    if (seatIndex !== expectedPlayer) return false;
    
    // Get game info for special rules validation
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { specialRules: true, gameState: true }
    });
    
    if (!game) return false;
    
    // Get player's hand to validate card play
    const playerHand = await this.getPlayerHand(gameId, seatIndex);
    if (!playerHand || !playerHand.some(c => c.suit === card.suit && c.rank === card.rank)) {
      return false; // Player doesn't have this card
    }
    
    // Apply special rules validation
    const specialRules = game.specialRules || {};
    const isLeadingTrick = currentTrick.cards.length === 0;
    const leadSuit = isLeadingTrick ? null : currentTrick.cards[0].suit;
    
    // SCREAMER: Cannot play spades unless following spade lead or no other suits available
    if (specialRules.screamer) {
      const isSpade = card.suit === 'SPADES';
      if (isSpade) {
        const followingSpadeLead = leadSuit === 'SPADES';
        const allSpades = playerHand.every(c => c.suit === 'SPADES');
        
        if (!followingSpadeLead && !allSpades) {
          return false;
        }
      }
    }
    
    // ASSASSIN: Must cut and lead spades when possible
    if (specialRules.assassin) {
      const isSpade = card.suit === 'SPADES';
      
      if (isLeadingTrick) {
        // When leading, must lead spades if available
        const hasSpades = playerHand.some(c => c.suit === 'SPADES');
        if (hasSpades && !isSpade) {
          return false;
        }
      } else {
        // When not leading, must play spades if available and can't follow suit
        if (leadSuit) {
          const hasLeadSuit = playerHand.some(c => c.suit === leadSuit);
          if (!hasLeadSuit) {
            // Can't follow suit, must play spades if available
            const hasSpades = playerHand.some(c => c.suit === 'SPADES');
            if (hasSpades && !isSpade) {
              return false;
            }
          }
        }
      }
    }
    
    // Standard suit following rules
    if (leadSuit && leadSuit !== card.suit) {
      const hasLeadSuit = playerHand.some(c => c.suit === leadSuit);
      if (hasLeadSuit) {
        return false; // Must follow suit
      }
    }
    
    return true;
  }

  /**
   * Complete a round and calculate scores
   */
  static async completeRound(tx, gameId, roundId) {
    // Get all player stats for this round
    const playerStats = await tx.playerRoundStats.findMany({
      where: { roundId }
    });

    // Calculate scores for each team
    let team0Score = 0;
    let team1Score = 0;
    let team0Bags = 0;
    let team1Bags = 0;

    for (const stat of playerStats) {
      const teamIndex = stat.teamIndex;
      const tricksWon = stat.tricksWon;
      const bid = stat.bid;
      
      let roundScore = 0;
      let bags = 0;

      if (stat.isBlindNil || stat.isNil) {
        if (tricksWon === 0) {
          roundScore = 100; // Made nil
        } else {
          roundScore = -100; // Failed nil
        }
      } else {
        if (tricksWon >= bid) {
          roundScore = bid * 10 + (tricksWon - bid); // Made bid + bags (1 point each)
          bags = tricksWon - bid; // Extra tricks are bags
        } else {
          roundScore = -bid * 10; // Failed bid
        }
      }

      if (teamIndex === 0) {
        team0Score += roundScore;
        team0Bags += bags;
      } else {
        team1Score += roundScore;
        team1Bags += bags;
      }
    }

    // Apply bag penalties (100 points penalty when bags reach 10+, then reset)
    if (team0Bags >= 10) {
      team0Score -= 100;
      team0Bags = team0Bags - 10; // Reset bags, keeping remainder
    }
    if (team1Bags >= 10) {
      team1Score -= 100;
      team1Bags = team1Bags - 10; // Reset bags, keeping remainder
    }

    // Save round score
    await tx.roundScore.upsert({
      where: { roundId },
      update: {
        team0Score,
        team1Score,
        team0Bags,
        team1Bags
      },
      create: {
        roundId,
        team0Score,
        team1Score,
        team0Bags,
        team1Bags
      }
    });

    // Check if game is complete
    const game = await tx.game.findUnique({ where: { id: gameId } });
    const totalRounds = game.currentRound;
    
    if (totalRounds >= 13 || Math.abs(team0Score) >= game.maxPoints || Math.abs(team1Score) >= game.maxPoints) {
      // Game complete
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          finishedAt: new Date()
        }
      });

      // Create game result
      const winner = team0Score > team1Score ? 'TEAM0' : 'TEAM1';
      await tx.gameResult.create({
        data: {
          gameId,
          winner,
          team0Final: team0Score,
          team1Final: team1Score,
          totalRounds,
          totalTricks: totalRounds * 13
        }
      });
    } else {
      // CRITICAL: Do NOT automatically start next round - wait for client confirmation
      // Just update the game status to show hand summary
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: 'HAND_SUMMARY' // Set status to show hand summary
        }
      });
      console.log(`[DATABASE GAME ENGINE] Round complete, set status to HAND_SUMMARY - waiting for client to continue`);
    }
  }
}
