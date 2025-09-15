// Core Safe Operations
export { SafeOperations } from './crash-prevention/core/safeOperations';

// Game Protection
export { protectRatedGame } from './crash-prevention/protection/gameProtection';

// State Management
export { saveGameStateSafely, restoreGameStateSafely } from './crash-prevention/state/stateManagement';

// Validation and Recovery
export { validateGameIntegrity, emergencyRecovery } from './crash-prevention/validation/gameValidation';

// Main CrashPrevention class that combines all functionality
import { SafeOperations } from './crash-prevention/core/safeOperations';
import { protectRatedGame } from './crash-prevention/protection/gameProtection';
import { saveGameStateSafely, restoreGameStateSafely } from './crash-prevention/state/stateManagement';
import { validateGameIntegrity, emergencyRecovery } from './crash-prevention/validation/gameValidation';

export class CrashPrevention {
  public static safeDbOperation = SafeOperations.safeDbOperation;
  public static protectRatedGame = protectRatedGame;
  public static saveGameStateSafely = saveGameStateSafely;
  public static restoreGameStateSafely = restoreGameStateSafely;
  public static validateGameIntegrity = validateGameIntegrity;
  public static emergencyRecovery = emergencyRecovery;
}
