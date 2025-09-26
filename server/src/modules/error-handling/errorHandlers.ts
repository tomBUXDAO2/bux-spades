export function setupErrorHandlers() {
	// EMERGENCY GLOBAL ERROR HANDLER - Minimal logging without in-memory state
	process.on('uncaughtException', (error) => {
		console.error('[EMERGENCY] Uncaught Exception:', error);
	});

	process.on('unhandledRejection', (reason, promise) => {
		console.error('[EMERGENCY] Unhandled Rejection at:', promise, 'reason:', reason);
	});
}
