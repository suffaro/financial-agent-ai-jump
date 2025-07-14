import { PrismaClient } from '@prisma/client';
import { GoogleService } from './googleService.js';
import { HubspotService } from './hubspotService.js';
import { AIService } from './aiService.js';
const prisma = new PrismaClient();
const googleService = new GoogleService();
const hubspotService = new HubspotService();
const aiService = new AIService();
export class SyncService {
    constructor() {
        this.syncIntervals = new Map();
        this.activeSyncs = new Map();
        this.failureCounts = new Map();
        this.lastFailureTime = new Map();
    }
    async startSyncForUser(userId) {
        console.log(`Starting sync for user: ${userId}`);
        await this.performFullSync(userId);
        const interval = setInterval(async () => {
            try {
                await this.performIncrementalSync(userId);
            }
            catch (error) {
                console.error(`Sync error for user ${userId}:`, error);
            }
        }, 5 * 60 * 1000);
        this.syncIntervals.set(userId, interval);
    }
    async startGoogleSyncForUser(userId) {
        console.log(`Starting Google sync for user: ${userId}`);
        try {
            await this.syncEmails(userId);
            try {
                await this.syncCalendar(userId);
            }
            catch (error) {
                if (error.message?.includes('Calendar API has not been used')) {
                    console.log(`Calendar API not enabled for user ${userId}, skipping calendar sync`);
                }
                else {
                    console.error(`Calendar sync error for user ${userId}:`, error);
                }
            }
            console.log(`Google sync completed for user: ${userId}`);
        }
        catch (error) {
            console.error(`Google sync failed for user ${userId}:`, error);
            throw error;
        }
    }
    async startHubSpotSyncForUser(userId) {
        console.log(`Starting HubSpot sync for user: ${userId}`);
        try {
            await this.syncHubSpotContacts(userId);
            await this.syncHubSpotNotes(userId);
            console.log(`HubSpot sync completed for user: ${userId}`);
        }
        catch (error) {
            console.error(`HubSpot sync failed for user ${userId}:`, error);
            throw error;
        }
    }
    async stopSyncForUser(userId) {
        const interval = this.syncIntervals.get(userId);
        if (interval) {
            clearInterval(interval);
            this.syncIntervals.delete(userId);
            console.log(`Stopped sync for user: ${userId}`);
        }
        this.activeSyncs.delete(userId);
    }
    setActiveSyncStatus(userId, service, isActive) {
        if (!this.activeSyncs.has(userId)) {
            this.activeSyncs.set(userId, new Set());
        }
        const userSyncs = this.activeSyncs.get(userId);
        if (isActive) {
            userSyncs.add(service);
        }
        else {
            userSyncs.delete(service);
        }
    }
    isServiceSyncing(userId, service) {
        return this.activeSyncs.get(userId)?.has(service) || false;
    }
    async performFullSync(userId) {
        console.log(`Performing full sync for user: ${userId}`);
        try {
            await this.syncEmails(userId);
            try {
                await this.syncCalendar(userId);
            }
            catch (error) {
                if (error.message?.includes('Calendar API has not been used')) {
                    console.log(`Calendar API not enabled for user ${userId}, skipping calendar sync`);
                }
                else {
                    console.error(`Calendar sync error for user ${userId}:`, error);
                }
            }
            await this.syncHubSpotContacts(userId);
            await this.syncHubSpotNotes(userId);
            console.log(`Full sync completed for user: ${userId}`);
        }
        catch (error) {
            console.error(`Full sync failed for user ${userId}:`, error);
        }
    }
    async performIncrementalSync(userId) {
        console.log(`Performing incremental sync for user: ${userId}`);
        try {
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
            if (user.accessToken && (!user.lastEmailSync || user.lastEmailSync < fiveMinutesAgo)) {
                console.log(`Gmail sync needed for user ${userId}: last sync ${user.lastEmailSync}`);
                await this.syncEmails(userId);
            }
            if (user.accessToken && (!user.lastCalendarSync || user.lastCalendarSync < fiveMinutesAgo)) {
                console.log(`Calendar sync needed for user ${userId}: last sync ${user.lastCalendarSync}`);
                await this.syncCalendar(userId);
            }
            if (user.hubspotAccessToken && (!user.lastHubspotSync || user.lastHubspotSync < fiveMinutesAgo)) {
                console.log(`HubSpot sync needed for user ${userId}: last sync ${user.lastHubspotSync}`);
                await this.syncHubSpotContacts(userId);
                await this.syncHubSpotNotes(userId);
            }
            const updateData = {};
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
        }
        catch (error) {
            console.error(`Incremental sync failed for user ${userId}:`, error);
        }
    }
    async syncEmails(userId) {
        try {
            this.setActiveSyncStatus(userId, 'gmail', true);
            await googleService.syncEmails(userId);
            console.log(`Email sync completed for user: ${userId}`);
        }
        catch (error) {
            console.error(`Email sync failed for user ${userId}:`, error);
        }
        finally {
            this.setActiveSyncStatus(userId, 'gmail', false);
        }
    }
    async syncCalendar(userId) {
        try {
            this.setActiveSyncStatus(userId, 'calendar', true);
            await googleService.syncCalendar(userId);
            console.log(`Calendar sync completed for user: ${userId}`);
        }
        catch (error) {
            console.error(`Calendar sync failed for user ${userId}:`, error);
        }
        finally {
            this.setActiveSyncStatus(userId, 'calendar', false);
        }
    }
    async syncHubSpotContacts(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { hubspotAccessToken: true }
            });
            if (!user?.hubspotAccessToken) {
                console.log(`Skipping HubSpot sync for user ${userId}: No HubSpot connection`);
                return;
            }
            if (this.shouldSkipSync(userId, 'hubspot')) {
                console.log(`Skipping HubSpot sync for user ${userId}: Circuit breaker is open`);
                return;
            }
            this.setActiveSyncStatus(userId, 'hubspot', true);
            await hubspotService.syncContacts(userId);
            this.resetFailureCount(userId, 'hubspot');
            console.log(`HubSpot contacts sync completed for user: ${userId}`);
        }
        catch (error) {
            console.error(`HubSpot contacts sync failed for user ${userId}:`, error);
            this.incrementFailureCount(userId, 'hubspot');
            if (error.message?.includes('Too many requests') || error.code === 'RATE_LIMITED') {
                this.setFailureBackoff(userId, 'hubspot', 10 * 60 * 1000);
            }
        }
        finally {
            this.setActiveSyncStatus(userId, 'hubspot', false);
        }
    }
    async syncHubSpotNotes(userId) {
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
        }
        catch (error) {
            console.error(`HubSpot notes sync failed for user ${userId}:`, error);
        }
    }
    async syncAllUsers() {
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
        }
        catch (error) {
            console.error('Failed to sync all users:', error);
        }
    }
    async stopAllSync() {
        for (const [userId, interval] of this.syncIntervals.entries()) {
            clearInterval(interval);
            console.log(`Stopped sync for user: ${userId}`);
        }
        this.syncIntervals.clear();
    }
    shouldSkipSync(userId, service) {
        console.log(`Circuit breaker disabled for ${service} sync`);
        return false;
    }
    incrementFailureCount(userId, service) {
        const key = `${userId}:${service}`;
        const currentCount = this.failureCounts.get(key) || 0;
        this.failureCounts.set(key, currentCount + 1);
        this.lastFailureTime.set(key, Date.now());
    }
    resetFailureCount(userId, service) {
        const key = `${userId}:${service}`;
        this.failureCounts.delete(key);
        this.lastFailureTime.delete(key);
    }
    setFailureBackoff(userId, service, backoffMs) {
        const key = `${userId}:${service}`;
        this.lastFailureTime.set(key, Date.now() + backoffMs);
    }
    async resetFailuresForUser(userId) {
        const services = ['gmail', 'calendar', 'hubspot'];
        for (const service of services) {
            this.resetFailureCount(userId, service);
        }
        console.log(`Reset all failures for user: ${userId}`);
    }
}
export const syncService = new SyncService();
