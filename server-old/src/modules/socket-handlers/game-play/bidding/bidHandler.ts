import type { AuthenticatedSocket } from '../../../../types/socket';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { prisma } from '../../../../lib/prisma';

/**
 * Handle bid socket event
 */
export async function handleMakeBid(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    const { gameId, bid } = data;
    const userId = socket.userId;
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    console.log('[BID HANDLER] User making bid:', { gameId, userId, bid, socketUserId: socket.userId, data });

    // Fetch game from database
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!dbGame) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Get game players
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: gameId },
      orderBy: { seatIndex: 'asc' }
    });

    // Find the player making the bid
    const player = gamePlayers.find(p => p.userId === userId);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    if (dbGame.status !== 'BIDDING') {
      socket.emit('error', { message: 'Game is not in bidding phase' });
      return;
    }

    // Store human player's bid in database
    try {
      // First, get the current round for this game
      const currentRound = await prisma.round.findFirst({
        where: { gameId: gameId },
        orderBy: { roundNumber: 'desc' }
      });
      
      if (currentRound) {
        // Store the bid in RoundBid table using upsert to handle duplicates
        await prisma.roundBid.upsert({
          where: { 
            roundId_userId: { 
              roundId: currentRound.id, 
              userId: player.userId 
            } 
          },
          update: { 
            bid: bid, 
            isBlindNil: false,
            seatIndex: player.seatIndex
          },
          create: {
            id: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            roundId: currentRound.id,
            userId: player.userId,
            seatIndex: player.seatIndex,
            bid: bid,
            isBlindNil: false
          }
        });
        
        // Update in-memory game state
        const { gamesStore } = await import('../../../../gamesStore');
        const inMemoryGame = gamesStore.getGame(gameId);
        if (inMemoryGame && inMemoryGame.bidding) {
          inMemoryGame.bidding.bids[player.seatIndex] = bid;
          inMemoryGame.players[player.seatIndex].bid = bid;
          console.log(`[BID HANDLER] Updated in-memory game state with bid ${bid} for seat ${player.seatIndex}`);
        }
      } else {
        console.log(`[BID HANDLER] No current round found for game ${gameId}`);
      }
    } catch (dbError) {
      console.error(`[BID HANDLER] Error storing human bid in database:`, dbError);
    }

    // Check if all players have bid using in-memory game state first
    const { gamesStore } = await import('../../../../gamesStore');
    const inMemoryGame = gamesStore.getGame(gameId);
    
    let allBidsCount = 0;
    if (inMemoryGame && inMemoryGame.bidding && inMemoryGame.bidding.bids) {
      allBidsCount = inMemoryGame.bidding.bids.filter(bid => bid !== null && bid !== undefined).length;
    }
    
    // Fallback to database check if in-memory check fails
    if (allBidsCount < 4) {
      const currentRound = await prisma.round.findFirst({
        where: { gameId: gameId },
        orderBy: { roundNumber: 'desc' }
      });
      
      const allBids = currentRound ? await prisma.roundBid.findMany({
        where: { roundId: currentRound.id }
      }) : [];
      
      allBidsCount = allBids.length;
      
      // Also check all rounds for this game to see if bids are in different rounds
      const allRounds = await prisma.round.findMany({
        where: { gameId: gameId },
        orderBy: { roundNumber: 'desc' }
      });
      console.log(`[BID HANDLER] All rounds for game:`, allRounds.map(r => ({ id: r.id, roundNumber: r.roundNumber })));
      
      for (const round of allRounds) {
        const roundBids = await prisma.roundBid.findMany({
          where: { roundId: round.id }
        });
        console.log(`[BID HANDLER] Round ${round.roundNumber} bids:`, roundBids.map(b => ({ userId: b.userId, bid: b.bid, seatIndex: b.seatIndex })));
      }
    }
    
    console.log(`[BID HANDLER] Total bids count: ${allBidsCount}/4`);
    
    // Debug: Check what bids we have
    if (inMemoryGame && inMemoryGame.bidding) {
      console.log('[BID HANDLER] In-memory bids:', inMemoryGame.bidding.bids);
    }
    
    // If all 4 players have bid, move to playing phase
    if (allBidsCount >= 4) {
      console.log('[BID HANDLER] All players have bid, transitioning to play phase');
      
      // Import and call handleBiddingComplete
      const { handleBiddingComplete } = await import('../../game-state/bidding/biddingCompletion');
      
      // Reconstruct game from database for bidding completion
      const dbGame = await prisma.game.findUnique({
        where: { id: gameId }
      });
      
      if (dbGame) {
        const gamePlayers = await prisma.gamePlayer.findMany({
          where: { gameId: gameId },
          orderBy: { seatIndex: 'asc' }
        });
        
        const userIds = gamePlayers.map(p => p.userId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } }
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        
        // Get bids for this round
        const currentRound = await prisma.round.findFirst({
          where: { gameId: gameId },
          orderBy: { roundNumber: 'desc' }
        });
        
        const allBids = currentRound ? await prisma.roundBid.findMany({
          where: { roundId: currentRound.id }
        }) : [];
        
        const bidMap = new Map(allBids.map(b => [b.userId, b.bid]));
        
        // Reconstruct game object for bidding completion
        const game = {
          id: dbGame.id,
          status: dbGame.status,
          mode: dbGame.mode || 'PARTNERS',
          players: gamePlayers.map(p => ({
            id: p.userId,
            username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
            type: p.isHuman ? 'human' as const : 'bot' as const,
            seatIndex: p.seatIndex,
            teamIndex: p.teamIndex,
            bid: bidMap.get(p.userId) ?? null,
            tricks: null as number | null,
            points: null as number | null,
            bags: null as number | null
          })),
          hands: [], // Will be populated if needed
          bidding: {
            bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null),
            currentBidderIndex: 0,
            currentPlayer: gamePlayers[0]?.userId || ''
          },
          dealerIndex: 0, // Default, will be updated if needed
          rules: {
            gameType: dbGame.mode || 'PARTNERS',
            allowNil: dbGame.nilAllowed ?? true,
            allowBlindNil: dbGame.blindNilAllowed ?? false,
            coinAmount: dbGame.buyIn || 100000,
            maxPoints: dbGame.maxPoints || 150,
            minPoints: dbGame.minPoints || -100,
            bidType: 'REGULAR',
            specialRules: {},
            gimmickType: undefined
          }
        } as any;
        
        await handleBiddingComplete(game);
      } else {
        console.error('[BID HANDLER] Game not found in database for bidding completion');
      }
      
      console.log('[BID HANDLER] Bid processed successfully');
      return;
    }

    // Get next player
    const currentSeatIndex = player.seatIndex;
    const nextSeatIndex = (currentSeatIndex + 1) % 4;
    const nextPlayer = gamePlayers.find(p => p.seatIndex === nextSeatIndex);

    if (nextPlayer) {
      // Update game status to next player's turn
      await prisma.game.update({
        where: { id: gameId },
        data: { 
          status: 'BIDDING'
          // Note: currentPlayer field doesn't exist in schema
        }
      });

      // Emit game update with proper bid data
      const updatedGame = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (updatedGame) {
        // Get current round and bids
        const currentRound = await prisma.round.findFirst({
          where: { gameId: gameId },
          orderBy: { roundNumber: 'desc' }
        });
        
        const bids = currentRound ? await prisma.roundBid.findMany({
          where: { roundId: currentRound.id }
        }) : [];
        
        const bidMap = new Map(bids.map(b => [b.userId, b.bid]));

        // Get users for player data
        const userIds = gamePlayers.map(p => p.userId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } }
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        const enrichedGame = {
          id: updatedGame.id,
          status: updatedGame.status,
          mode: updatedGame.mode || 'PARTNERS',
          rated: updatedGame.isRated ?? false,
          league: updatedGame.isLeague ?? false,
          solo: (updatedGame.mode === 'SOLO') || false,
          minPoints: updatedGame.minPoints || -100,
          maxPoints: updatedGame.maxPoints || 150,
          buyIn: updatedGame.buyIn || 100000,
          currentPlayer: nextPlayer.userId,
          players: gamePlayers.map(p => ({
            id: p.userId,
            username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
            avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
            type: p.isHuman ? 'human' : 'bot',
            seatIndex: p.seatIndex,
            teamIndex: p.teamIndex ?? null,
            bid: bidMap.get(p.userId) ?? null,
            tricks: null as number | null,
            points: null as number | null,
            bags: null as number | null
          })),
          bidding: {
            currentPlayer: nextPlayer.userId,
            currentBidderIndex: nextSeatIndex,
            bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null)
          },
          rules: {
            minPoints: updatedGame.minPoints || -100,
            maxPoints: updatedGame.maxPoints || 150,
            allowNil: updatedGame.nilAllowed ?? true,
            allowBlindNil: updatedGame.blindNilAllowed ?? false,
            assassin: false,
            screamer: false
          },
          createdAt: updatedGame.createdAt
        };

        console.log(`[BID HANDLER] Emitting game_update to room ${gameId} with bids:`, {
          players: enrichedGame.players.map(p => ({ id: p.id, bid: p.bid, username: p.username })),
          bidding: enrichedGame.bidding
        });
        
        // Debug: Check if room has sockets before emitting
        const room = io.sockets.adapter.rooms.get(gameId);
        console.log(`[BID HANDLER DEBUG] Room ${gameId} has ${room?.size || 0} sockets:`, Array.from(room || []));
        
        io.to(gameId).emit('game_update', enrichedGame);
      }

      // If next player is a bot, trigger bot bid
      if (nextPlayer.isHuman === false) {
        setTimeout(async () => {
          try {
            console.log('[BID HANDLER] Triggering bot bid for player at seat', nextSeatIndex);
            // Import bot logic and gamesStore
            const { botMakeMove } = await import('../../../bot-play/botLogic');
            const { gamesStore } = await import('../../../../gamesStore');
            
            // Get the game from gamesStore first, then fallback to database
            let game = gamesStore.getGame(gameId);
            if (!game) {
              console.log('[BID HANDLER] Game not found in gamesStore, fetching from database');
              // Fetch game from database and reconstruct for bot logic
              const dbGame = await prisma.game.findUnique({
                where: { id: gameId }
              });
              
              if (dbGame) {
                const gamePlayers = await prisma.gamePlayer.findMany({
                  where: { gameId: gameId },
                  orderBy: { seatIndex: 'asc' }
                });
                
                const userIds = gamePlayers.map(p => p.userId);
                const users = await prisma.user.findMany({
                  where: { id: { in: userIds } }
                });
                const userMap = new Map(users.map(u => [u.id, u]));
                
                // Reconstruct game object for bot logic
                game = {
                  id: dbGame.id,
                  status: dbGame.status,
                  players: gamePlayers.map(p => ({
                    id: p.userId,
                    username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
                    type: p.isHuman ? 'human' as const : 'bot' as const,
                    seatIndex: p.seatIndex,
                    teamIndex: p.teamIndex,
                    bid: null as number | null,
                    tricks: null as number | null,
                    points: null as number | null,
                    bags: null as number | null
                  })),
                  hands: [], // Will be populated by bot logic if needed
                  bidding: {
                    bids: [null, null, null, null],
                    currentBidderIndex: nextSeatIndex,
                    currentPlayer: nextPlayer.userId
                  },
                  dealerIndex: 0 // Default, will be updated if needed
                } as any;
                
                // Add to gamesStore for future use
                gamesStore.addGame(game);
              }
            }
            
            if (game) {
              console.log('[BID HANDLER] Found game, triggering bot bid');
              await botMakeMove(game, nextSeatIndex, 'bidding', io);
            } else {
              console.log('[BID HANDLER] Game not found in database for bot bidding');
            }
          } catch (error) {
            console.error('[BID HANDLER] Error triggering bot bid:', error);
          }
        }, 1000);
      }
    }

    console.log('[BID HANDLER] Bid processed successfully');

  } catch (error) {
    console.error('[BID HANDLER] Error processing bid:', error);
    socket.emit('error', { message: 'Failed to process bid' });
  }
}
