/**
 * CRASH PREVENTION SYSTEM
 * Core safe operations with retry and fallback logic
 */
export class SafeOperations {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;

  /**
   * Safe database operation with retry and fallback
   */
  public static async safeDbOperation<T>(
    operation: () => Promise<T>,
    fallback?: () => T,
    context: string = 'Unknown'
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.error(`[CRASH PREVENTION] ${context} failed (attempt ${attempt}/${this.MAX_RETRIES}):`, error);
        
        if (attempt === this.MAX_RETRIES) {
          if (fallback) {
            console.log(`[CRASH PREVENTION] Using fallback for ${context}`);
            return fallback();
          }
          console.error(`[CRASH PREVENTION] ${context} failed after all retries - this could cause a crash`);
          return null;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
      }
    }
    return null;
  }
}
