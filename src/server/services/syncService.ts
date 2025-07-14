import { PrismaClient } from '@prisma/client';
import { GoogleService } from './googleService.js';
import { HubspotService } from './hubspotService.js';
import { AIService } from './aiService.js';

const prisma = new PrismaClient();
const googleService = new GoogleService();
const hubspotService = new HubspotService();
const aiService = new AIService();

export class SyncService {
    private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
    private activeSyncs: Map<string, Set<string>> = new Map();
    private failureCounts: Map<string, number> = new Map();
    private lastFailureTime: Map<string, number> = new Map();

    async startSyncForUser(userId: string): Promise<void> {
        console.log(`Starting sync for user: ${userId}`);
        
        // Initial sync
        await this.performFullSync(userId);
        
        // Set up periodic sync every 5 minutes
        const interval = setInterval(async () => {
            try {
                await this.performIncrementalSync(userId);
            } catch (error) {
                console.error(`Sync error for user ${userId}:`, error);
            }
        }, 5 * 60 * 1000); // 5 minutes
        
        this.syncIntervals.set(userId, interval);
    }

    async startGoogleSyncForUser(userId: string): Promise<void> {
        console.log(`Starting Google sync for user: ${userId}`);
        
        try {
            // Sync emails
            await this.syncEmails(userId);
            
            // Sync calendar
            try {
                await this.syncCalendar(userId);
            } catch (error: any) {
                if (error.message?.includes('Calendar API has not been used')) {
                    console.log(`Calendar API not enabled for user ${userId}, skipping calendar sync`);
                } else {
                    console.error(`Calendar sync error for user ${userId}:`, error);
                }
            }
            
            console.log(`Google sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`Google sync failed for user ${userId}:`, error);
            throw error;
        }
    }

    async startHubSpotSyncForUser(userId: string): Promise<void> {
        console.log(`Starting HubSpot sync for user: ${userId}`);
        
        try {
            // Sync HubSpot contacts
            await this.syncHubSpotContacts(userId);
            
            // Sync HubSpot notes
            await this.syncHubSpotNotes(userId);
            
            console.log(`HubSpot sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`HubSpot sync failed for user ${userId}:`, error);
            throw error;
        }
    }

    async stopSyncForUser(userId: string): Promise<void> {
        const interval = this.syncIntervals.get(userId);
        if (interval) {
            clearInterval(interval);
            this.syncIntervals.delete(userId);
            console.log(`Stopped sync for user: ${userId}`);
        }
        this.activeSyncs.delete(userId);
    }

    private setActiveSyncStatus(userId: string, service: string, isActive: boolean): void {
        if (!this.activeSyncs.has(userId)) {
            this.activeSyncs.set(userId, new Set());
        }
        const userSyncs = this.activeSyncs.get(userId)!;
        if (isActive) {
            userSyncs.add(service);
        } else {
            userSyncs.delete(service);
        }
    }

    public isServiceSyncing(userId: string, service: string): boolean {
        return this.activeSyncs.get(userId)?.has(service) || false;
    }

    private async performFullSync(userId: string): Promise<void> {
        console.log(`Performing full sync for user: ${userId}`);
        
        try {
            // Sync emails
            await this.syncEmails(userId);
            
            // Sync calendar (disabled until Google Calendar API is enabled in Google Console)
            try {
                await this.syncCalendar(userId);
            } catch (error: any) {
                if (error.message?.includes('Calendar API has not been used')) {
                    console.log(`Calendar API not enabled for user ${userId}, skipping calendar sync`);
                } else {
                    console.error(`Calendar sync error for user ${userId}:`, error);
                }
            }
            
            // Sync HubSpot contacts
            await this.syncHubSpotContacts(userId);
            
            // Sync HubSpot notes
            await this.syncHubSpotNotes(userId);
            
            console.log(`Full sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`Full sync failed for user ${userId}:`, error);
        }
    }

    private async performIncrementalSync(userId: string): Promise<void> {
        console.log(`Performing incremental sync for user: ${userId}`);
        
        try {
            // Check if user has valid tokens
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { 
                    accessToken: true, 
                    hubspotAccessToken: true,
                    lastEmailSync: true,
                    lastCalendarSync: true,
                    lastHubspotSync: true
                }
            });

            if (!user) {
                console.log(`User ${userId} not found, stopping sync`);
                await this.stopSyncForUser(userId);
                return;
            }

            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            
            // Sync emails only if Google token exists and last sync was > 5 minutes ago
            if (user.accessToken && (!user.lastEmailSync || user.lastEmailSync < fiveMinutesAgo)) {
                console.log(`Gmail sync needed for user ${userId}: last sync ${user.lastEmailSync}`);
                await this.syncEmails(userId);
            }
            
            // Sync calendar only if Google token exists and last sync was > 5 minutes ago  
            if (user.accessToken && (!user.lastCalendarSync || user.lastCalendarSync < fiveMinutesAgo)) {
                console.log(`Calendar sync needed for user ${userId}: last sync ${user.lastCalendarSync}`);
                await this.syncCalendar(userId);
            }

            // Sync HubSpot only if token exists and last sync was > 5 minutes ago
            if (user.hubspotAccessToken && (!user.lastHubspotSync || user.lastHubspotSync < fiveMinutesAgo)) {
                console.log(`HubSpot sync needed for user ${userId}: last sync ${user.lastHubspotSync}`);
                await this.syncHubSpotContacts(userId);
                await this.syncHubSpotNotes(userId);
            }

            // Update last sync times only for services that were actually synced
            const updateData: any = {};
            if (user.accessToken && (!user.lastEmailSync || user.lastEmailSync < fiveMinutesAgo)) {
                updateData.lastEmailSync = now;
            }
            if (user.accessToken && (!user.lastCalendarSync || user.lastCalendarSync < fiveMinutesAgo)) {
                updateData.lastCalendarSync = now;
            }
            if (user.hubspotAccessToken && (!user.lastHubspotSync || user.lastHubspotSync < fiveMinutesAgo)) {
                updateData.lastHubspotSync = now;
            }
            
            if (Object.keys(updateData).length > 0) {
                await prisma.user.update({
                    where: { id: userId },
                    data: updateData
                });
            }

            console.log(`Incremental sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`Incremental sync failed for user ${userId}:`, error);
        }
    }

    private async syncEmails(userId: string): Promise<void> {
        try {
            this.setActiveSyncStatus(userId, 'gmail', true);
            await googleService.syncEmails(userId);
            console.log(`Email sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`Email sync failed for user ${userId}:`, error);
        } finally {
            this.setActiveSyncStatus(userId, 'gmail', false);
        }
    }

    private async syncCalendar(userId: string): Promise<void> {
        try {
            this.setActiveSyncStatus(userId, 'calendar', true);
            await googleService.syncCalendar(userId);
            console.log(`Calendar sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`Calendar sync failed for user ${userId}:`, error);
        } finally {
            this.setActiveSyncStatus(userId, 'calendar', false);
        }
    }

    private async syncHubSpotContacts(userId: string): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { hubspotAccessToken: true }
            });

            if (!user?.hubspotAccessToken) {
                console.log(`Skipping HubSpot sync for user ${userId}: No HubSpot connection`);
                return;
            }

            // Check circuit breaker
            if (this.shouldSkipSync(userId, 'hubspot')) {
                console.log(`Skipping HubSpot sync for user ${userId}: Circuit breaker is open`);
                return;
            }

            this.setActiveSyncStatus(userId, 'hubspot', true);
            await hubspotService.syncContacts(userId);

            // Reset failure count on success
            this.resetFailureCount(userId, 'hubspot');

            console.log(`HubSpot contacts sync completed for user: ${userId}`);
        } catch (error: any) {
            console.error(`HubSpot contacts sync failed for user ${userId}:`, error);
            
            // Increment failure count
            this.incrementFailureCount(userId, 'hubspot');
            
            // If it's a rate limit error, wait longer before retrying
            if (error.message?.includes('Too many requests') || error.code === 'RATE_LIMITED') {
                this.setFailureBackoff(userId, 'hubspot', 10 * 60 * 1000); // 10 minutes
            }
        } finally {
            this.setActiveSyncStatus(userId, 'hubspot', false);
        }
    }

    private async syncHubSpotNotes(userId: string): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { hubspotAccessToken: true }
            });

            if (!user?.hubspotAccessToken) {
                console.log(`Skipping HubSpot notes sync for user ${userId}: No HubSpot connection`);
                return;
            }

            await hubspotService.syncNotes(userId);

            console.log(`HubSpot notes sync completed for user: ${userId}`);
        } catch (error) {
            console.error(`HubSpot notes sync failed for user ${userId}:`, error);
        }
    }

    async syncAllUsers(): Promise<void> {
        try {
            const users = await prisma.user.findMany({
                where: {
                    OR: [
                        { accessToken: { not: null } },
                        { hubspotAccessToken: { not: null } }
                    ]
                },
                select: { id: true }
            });

            console.log(`Starting sync for ${users.length} users`);

            for (const user of users) {
                if (!this.syncIntervals.has(user.id)) {
                    await this.startSyncForUser(user.id);
                }
            }
        } catch (error) {
            console.error('Failed to sync all users:', error);
        }
    }

    async stopAllSync(): Promise<void> {
        for (const [userId, interval] of this.syncIntervals.entries()) {
            clearInterval(interval);
            console.log(`Stopped sync for user: ${userId}`);
        }
        this.syncIntervals.clear();
    }

    private shouldSkipSync(userId: string, service: string): boolean {
        // EMERGENCY: Disable circuit breaker temporarily
        console.log(`Circuit breaker disabled for ${service} sync`);
        return false;
    }

    private incrementFailureCount(userId: string, service: string): void {
        const key = `${userId}:${service}`;
        const currentCount = this.failureCounts.get(key) || 0;
        this.failureCounts.set(key, currentCount + 1);
        this.lastFailureTime.set(key, Date.now());
    }

    private resetFailureCount(userId: string, service: string): void {
        const key = `${userId}:${service}`;
        this.failureCounts.delete(key);
        this.lastFailureTime.delete(key);
    }

    private setFailureBackoff(userId: string, service: string, backoffMs: number): void {
        const key = `${userId}:${service}`;
        this.lastFailureTime.set(key, Date.now() + backoffMs);
    }

    public async resetFailuresForUser(userId: string): Promise<void> {
        const services = ['gmail', 'calendar', 'hubspot'];
        for (const service of services) {
            this.resetFailureCount(userId, service);
        }
        console.log(`Reset all failures for user: ${userId}`);
    }
}

export const syncService = new SyncService();