import { TrickLogger } from './trick-logging/core/trickLogger';
import { TrickStatsService } from './trick-logging/stats/trickStats';

// Export types
export * from './trick-logging/types/trickLogTypes';

// Export utilities
export * from './trick-logging/utils/cardUtils';

// Export core logger
export { TrickLogger } from './trick-logging/core/trickLogger';

// Export stats service
export { TrickStatsService } from './trick-logging/stats/trickStats';

// Create and export singleton instances
export const trickLogger = new TrickLogger();
export const trickStatsService = new TrickStatsService();
