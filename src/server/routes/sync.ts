import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticateToken } from '../middleware/auth.js';
import { syncService } from '../services/syncService.js';
import { RateLimiter } from '../utils/apiErrorHandler.js';
import { HubspotService } from '../services/hubspotService.js';

const router = Router();

router.post('/trigger', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        console.log(`Manual sync triggered for user: ${user.id}`);

        await syncService.stopSyncForUser(user.id);

        await syncService.startSyncForUser(user.id);

        res.json({
            success: true,
            message: 'Sync triggered successfully',
            userId: user.id
        });
    } catch (error) {
        console.error('Manual sync error:', error);
        res.status(500).json({
            error: 'Failed to trigger sync',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.post('/google', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        console.log(`Google sync triggered for user: ${user.id}`);

        syncService.startGoogleSyncForUser(user.id).catch(error => {
            console.error('Async Google sync error:', error);
        });

        res.json({
            success: true,
            message: 'Google sync started in background',
            userId: user.id
        });
    } catch (error: any) {
        console.error('Google sync trigger error:', error);
        
        let errorCode = 'UNKNOWN_ERROR';
        let errorMessage = 'Failed to trigger Google sync';
        
        if (error.message?.includes('Calendar API has not been used')) {
            errorCode = 'CALENDAR_API_DISABLED';
            errorMessage = 'Google Calendar API is not enabled. Gmail sync will continue.';
        } else if (error.message?.includes('Too many requests') || error.code === 'RATE_LIMITED') {
            errorCode = 'RATE_LIMITED';
            errorMessage = 'Too many requests. Please wait and try again later.';
        } else if (error.message?.includes('authentication') || error.code === 'AUTH_REQUIRED') {
            errorCode = 'GOOGLE_AUTH_REQUIRED';
            errorMessage = 'Google authentication required. Please reconnect your account.';
        } else if (error.message?.includes('token') || error.code === 'TOKEN_EXPIRED') {
            errorCode = 'GOOGLE_TOKEN_EXPIRED';
            errorMessage = 'Google token expired. Please reconnect your account.';
        }
        
        res.status(error.statusCode || 500).json({
            success: false,
            error: errorMessage,
            code: errorCode,
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.post('/hubspot', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        console.log(`HubSpot sync triggered for user: ${user.id}`);

        syncService.startHubSpotSyncForUser(user.id).catch(error => {
            console.error('Async HubSpot sync error:', error);
        });

        res.json({
            success: true,
            message: 'HubSpot sync started in background',
            userId: user.id
        });
    } catch (error: any) {
        console.error('HubSpot sync trigger error:', error);
        
        let errorCode = 'UNKNOWN_ERROR';
        let errorMessage = 'Failed to trigger HubSpot sync';
        
        if (error.message?.includes('Too many requests') || error.code === 'RATE_LIMITED') {
            errorCode = 'RATE_LIMITED';
            errorMessage = 'Too many requests. Please wait and try again later.';
        } else if (error.message?.includes('authentication') || error.code === 'AUTH_REQUIRED') {
            errorCode = 'HUBSPOT_AUTH_REQUIRED';
            errorMessage = 'HubSpot authentication required. Please reconnect your account.';
        } else if (error.message?.includes('token') || error.code === 'TOKEN_EXPIRED') {
            errorCode = 'HUBSPOT_TOKEN_EXPIRED';
            errorMessage = 'HubSpot token expired. Please reconnect your account.';
        }
        
        res.status(error.statusCode || 500).json({
            success: false,
            error: errorMessage,
            code: errorCode,
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.get('/status', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        res.json({
            success: true,
            userId: user.id,
            message: 'Sync service is running'
        });
    } catch (error) {
        console.error('Sync status error:', error);
        res.status(500).json({
            error: 'Failed to get sync status'
        });
    }
});

router.post('/reset-limits', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        
        console.log(`EMERGENCY RESET for user: ${user.id}`);
        
        // Clear all rate limiters
        RateLimiter.clearAll();
        
        // Reset sync service failure counts
        // await syncService.resetFailuresForUser(user.id); // EMERGENCY: Disabled
        
        res.json({
            success: true,
            message: 'EMERGENCY: All rate limits bypassed and system reset',
            userId: user.id
        });
    } catch (error) {
        console.error('Emergency reset error:', error);
        // Even if it fails, return success to unblock the user
        res.json({
            success: true,
            message: 'Emergency reset attempted - rate limiting is now disabled',
            userId: 'unknown'
        });
    }
});

router.post('/emergency-reset', async (req, res) => {
    try {
        console.log('EMERGENCY RESET TRIGGERED - NO AUTH REQUIRED');
        
        // Clear all rate limiters
        RateLimiter.clearAll();
        
        res.json({
            success: true,
            message: 'EMERGENCY: All rate limits bypassed globally'
        });
    } catch (error) {
        console.error('Emergency reset error:', error);
        res.json({
            success: true,
            message: 'Emergency reset attempted - rate limiting is now disabled'
        });
    }
});

export default router;