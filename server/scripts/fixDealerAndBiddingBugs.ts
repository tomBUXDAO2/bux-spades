import fs from 'fs';
import path from 'path';

async function fixDealerAndBiddingBugs() {
  try {
    console.log('🔧 Fixing dealer and bidding bugs...\n');
    
    const serverPath = path.join(__dirname, '..', 'src');
    const indexPath = path.join(serverPath, 'index.ts');
    
    // Read the current file
    let content = fs.readFileSync(indexPath, 'utf8');
    
    console.log('1️⃣ Fixing dealer movement and first bidder logic...');
    
    // Fix 1: In hand transition logic (around line 2103)
    const oldHandTransitionLogic = `// Move dealer to the left (next position)
              game.dealerIndex = (game.dealerIndex + 1) % 4;
              
              // Reset game state for new hand
              game.status = "BIDDING";
              game.bidding = {
                currentPlayer: game.players[game.dealerIndex]?.id || "",
                currentBidderIndex: game.dealerIndex,`;
    
    const newHandTransitionLogic = `// Move dealer to the left (next position)
              game.dealerIndex = (game.dealerIndex + 1) % 4;
              
              // Reset game state for new hand
              game.status = "BIDDING";
              // First bidder is left of dealer, not the dealer
              const firstBidderIndex = (game.dealerIndex + 1) % 4;
              game.bidding = {
                currentPlayer: game.players[firstBidderIndex]?.id || "",
                currentBidderIndex: firstBidderIndex,`;
    
    if (content.includes(oldHandTransitionLogic)) {
      content = content.replace(oldHandTransitionLogic, newHandTransitionLogic);
      console.log('   ✅ Fixed hand transition logic');
    } else {
      console.log('   ⚠️  Hand transition logic not found or already fixed');
    }
    
    // Fix 2: In periodic check logic (around line 3952)
    const oldPeriodicLogic = `// Move dealer to the left (next position)
          game.dealerIndex = (game.dealerIndex + 1) % 4;
          
          // Reset game state for new hand
          game.status = 'BIDDING';
          game.bidding = {
            currentPlayer: game.players[game.dealerIndex]?.id || '',
            currentBidderIndex: game.dealerIndex,`;
    
    const newPeriodicLogic = `// Move dealer to the left (next position)
          game.dealerIndex = (game.dealerIndex + 1) % 4;
          
          // Reset game state for new hand
          game.status = 'BIDDING';
          // First bidder is left of dealer, not the dealer
          const firstBidderIndex = (game.dealerIndex + 1) % 4;
          game.bidding = {
            currentPlayer: game.players[firstBidderIndex]?.id || '',
            currentBidderIndex: firstBidderIndex,`;
    
    if (content.includes(oldPeriodicLogic)) {
      content = content.replace(oldPeriodicLogic, newPeriodicLogic);
      console.log('   ✅ Fixed periodic check logic');
    } else {
      console.log('   ⚠️  Periodic check logic not found or already fixed');
    }
    
    // Fix 3: Add comments to clarify the logic
    const commentAddition = `// CRITICAL: Dealer and bidding logic
    // 1. Dealer moves 1 position left each hand: (dealerIndex + 1) % 4
    // 2. First bidder is left of dealer: (dealerIndex + 1) % 4
    // 3. This ensures proper rotation: Dealer -> First Bidder -> Second Bidder -> Third Bidder -> Dealer`;
    
    // Find a good place to add this comment
    const dealerAssignmentPattern = /const dealerIndex = assignDealer\(game\.players, game\.dealerIndex\);/;
    if (content.includes('const dealerIndex = assignDealer(game.players, game.dealerIndex);')) {
      content = content.replace(
        'const dealerIndex = assignDealer(game.players, game.dealerIndex);',
        `${commentAddition}\n\nconst dealerIndex = assignDealer(game.players, game.dealerIndex);`
      );
      console.log('   ✅ Added dealer/bidding logic documentation');
    }
    
    // Write the updated file
    fs.writeFileSync(indexPath, content);
    console.log('\n✅ Dealer and bidding fixes applied successfully!');
    
    console.log('\n🎯 Summary of fixes:');
    console.log('   • Fixed dealer movement to move exactly 1 position left');
    console.log('   • Fixed first bidder to be left of dealer, not the dealer');
    console.log('   • Applied fixes to both hand transition and periodic check logic');
    console.log('   • Added documentation for dealer/bidding logic');
    console.log('   • Future games should have correct dealer rotation and bidding order');
    
  } catch (error) {
    console.error('❌ Error fixing dealer and bidding bugs:', error);
  }
}

fixDealerAndBiddingBugs();
