// Legacy sound utility wrappers.
// Everything now forwards to the shared AudioManager helpers so dynamic imports
// and existing call sites continue to work with the preloaded audio elements.

export {
  playCardSound,
  playBidSound,
  playWinSound,
  playCheeringSound,
  playPositiveSound,
  playNegativeSound,
  playKissSound,
  playFartSound,
  playPukeSound,
  playGrrrSound,
  playEmojiSound,
  playCardDealingSound,
} from '../../components/game/components/AudioManager';


