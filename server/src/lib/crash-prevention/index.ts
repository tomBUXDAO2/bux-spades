// Core Safe Operations
export { SafeOperations } from './core/safeOperations';

// Game Protection
export { protectRatedGame } from './protection/gameProtection';

// State Management
export { saveGameStateSafely, restoreGameStateSafely } from './state/stateManagement';

// Validation and Recovery
export { validateGameIntegrity, emergencyRecovery } from './validation/gameValidation';

// Main CrashPrevention class that combines all functionality
import { SafeOperations } from './core/safeOperations';
import { protectRatedGame } from './protection/gameProtection';
import { saveGameStateSafely, restoreGameStateSafely } from './state/stateManagement';
import { validateGameIntegrity, emergencyRecovery } from './validation/gameValidation';

export class CrashPrevention {
  public static safeDbOperation = SafeOperations.safeDbOperation;
  public static protectRatedGame = protectRatedGame;
  public static saveGameStateSafely = saveGameStateSafely;
  public static restoreGameStateSafely = restoreGameStateSafely;
  public static validateGameIntegrity = validateGameIntegrity;
  public static emergencyRecovery = emergencyRecovery;
}
