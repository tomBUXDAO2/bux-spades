#!/bin/bash

echo "Disabling old DB references and unrated game deletion..."

# 1. Comment out unrated game deletion in gameCompletion.ts
sed -i.bak 's/await deleteUnratedGameFromDatabase(game);/\/\/ DISABLED FOR TESTING: await deleteUnratedGameFromDatabase(game);/' server/src/lib/hand-completion/game/gameCompletion.ts

# 2. Comment out unrated game deletion in other files
sed -i.bak 's/await deleteUnratedGameFromDatabase(game);/\/\/ DISABLED FOR TESTING: await deleteUnratedGameFromDatabase(game);/' server/src/lib/game-cleanup/waiting/waitingGameCleanup.ts
sed -i.bak 's/await deleteUnratedGameFromDatabase(game);/\/\/ DISABLED FOR TESTING: await deleteUnratedGameFromDatabase(game);/' server/src/modules/timeout-management/handlers/consecutive/consecutiveTimeoutHandler.ts
sed -i.bak 's/await deleteUnratedGameFromDatabase(game);/\/\/ DISABLED FOR TESTING: await deleteUnratedGameFromDatabase(game);/' server/src/modules/play-again/playAgainManager.ts
sed -i.bak 's/await deleteUnratedGameFromDatabase(game);/\/\/ DISABLED FOR TESTING: await deleteUnratedGameFromDatabase(game);/' server/src/modules/connection-management/connectionManager.ts

echo "Done! Files modified:"
echo "- server/src/lib/hand-completion/game/gameCompletion.ts"
echo "- server/src/lib/game-cleanup/waiting/waitingGameCleanup.ts"
echo "- server/src/modules/timeout-management/handlers/consecutive/consecutiveTimeoutHandler.ts"
echo "- server/src/modules/play-again/playAgainManager.ts"
echo "- server/src/modules/connection-management/connectionManager.ts"
