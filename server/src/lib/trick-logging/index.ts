import { TrickLogger } from "./core/trickLogger";
import { TrickStatsService } from './stats/trickStats';

// Export types
export * from './types/trickLogTypes';

// Export utilities
export * from './utils/cardUtils';

// Export core logger
export { TrickLogger } from "./core/trickLogger";

// Export stats service
export { TrickStatsService } from './stats/trickStats';

// Create and export singleton instances
export const trickLogger = new TrickLogger();
export const trickStatsService = new TrickStatsService();
