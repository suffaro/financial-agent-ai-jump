import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { GoogleService } from '../services/googleService.js';
import { HubspotService } from '../services/hubspotService.js';
import { requireGoogleAuth, requireHubspotAuth } from '../middleware/auth.js';
import { syncService } from '../services/syncService.js';

const router = Router();
const prisma = new PrismaClient();
const googleService = new GoogleService();
const hubspotService = new HubspotService();


router.post('/gmail/sync', requireGoogleAuth, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).user!.id;
        await googleService.syncEmails(userId);


        await prisma.user.update({
            where: { id: userId },
            data: { lastEmailSync: new Date() }
        });

        res.json({ message: 'Gmail sync completed successfully' });
    } catch (error) {
        console.error('Gmail sync error:', error);
        res.status(500).json({ error: 'Failed to sync Gmail' });
    }
});


router.post('/calendar/sync', requireGoogleAuth, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).user!.id;
        await googleService.syncCalendar(userId);

        await prisma.user.update({
            where: { id: userId },
            data: { lastCalendarSync: new Date() }
        });

        res.json({ message: 'Calendar sync completed successfully' });
    } catch (error) {
        console.error('Calendar sync error:', error);
        res.status(500).json({ error: 'Failed to sync calendar' });
    }
});

router.post('/hubspot/contacts/sync', requireHubspotAuth, async (req, res) => {
    try {
        const userId = (req as AuthenticatedRequest).user!.id;
        await hubspotService.syncContacts(userId);

        await prisma.user.update({
            where: { id: userId },
            data: { lastHubspotSync: new Date() }
        });

        res.json({ message: 'HubSpot contacts sync completed successfully' });
    } catch (error) {
        console.error('HubSpot contacts sync error:', error);
        res.status(500).json({ error: 'Failed to sync HubSpot contacts' });
    }
});

router.post('/hubspot/notes/sync', requireHubspotAuth, async (req, res) => {
    try {
        await hubspotService.syncNotes((req as AuthenticatedRequest).user!.id);
        res.json({ message: 'HubSpot notes sync completed successfully' });
    } catch (error) {
        console.error('HubSpot notes sync error:', error);
        res.status(500).json({ error: 'Failed to sync HubSpot notes' });
    }
});

router.get('/connections', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: (req as AuthenticatedRequest).user!.id },
            select: {
                accessToken: true,
                hubspotAccessToken: true,
                googleId: true,
                name: true,
                email: true
            }
        });

        const connections = {
            google: {
                connected: !!user?.accessToken,
                email: user?.email,
                name: user?.name
            },
            hubspot: {
                connected: !!user?.hubspotAccessToken
            }
        };

        res.json({ connections });
    } catch (error) {
        console.error('Get connections error:', error);
        res.status(500).json({ error: 'Failed to get connections' });
    }
});

router.get('/sync/status', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: (req as AuthenticatedRequest).user!.id },
            select: {
                accessToken: true,
                hubspotAccessToken: true,
                lastEmailSync: true,
                lastCalendarSync: true,
                lastHubspotSync: true,
                emailMessages: {
                    select: { id: true },
                    take: 1
                },
                calendarEvents: {
                    select: { id: true },
                    take: 1
                },
                hubspotContacts: {
                    select: { id: true },
                    take: 1
                }
            }
        });

        const userId = (req as AuthenticatedRequest).user!.id;
        const isGmailSyncing = syncService.isServiceSyncing(userId, 'gmail');
        const isCalendarSyncing = syncService.isServiceSyncing(userId, 'calendar');
        const isHubspotSyncing = syncService.isServiceSyncing(userId, 'hubspot');
        
        const status = {
            gmail: {
                connected: !!user?.accessToken,
                syncing: isGmailSyncing,
                synced: !isGmailSyncing && !!user?.lastEmailSync
            },
            calendar: {
                connected: !!user?.accessToken,
                syncing: isCalendarSyncing,
                synced: !isCalendarSyncing && !!user?.lastCalendarSync
            },
            hubspot: {
                connected: !!user?.hubspotAccessToken,
                syncing: isHubspotSyncing,
                synced: !isHubspotSyncing && !!user?.lastHubspotSync
            }
        };

        res.json({ status });
    } catch (error) {
        console.error('Get sync status error:', error);
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const [
            emailCount,
            calendarCount,
            contactCount,
            noteCount
        ] = await Promise.all([
            prisma.emailMessage.count({ where: { userId: (req as AuthenticatedRequest).user!.id } }),
            prisma.calendarEvent.count({ where: { userId: (req as AuthenticatedRequest).user!.id } }),
            prisma.hubspotContact.count({ where: { userId: (req as AuthenticatedRequest).user!.id } }),
            prisma.hubspotNote.count({ where: { userId: (req as AuthenticatedRequest).user!.id } })
        ]);

        res.json({
            summary: {
                emails: emailCount,
                calendarEvents: calendarCount,
                contacts: contactCount,
                notes: noteCount
            }
        });
    } catch (error) {
        console.error('Get integration summary error:', error);
        res.status(500).json({ error: 'Failed to get integration summary' });
    }
});

router.get('/gmail/search', requireGoogleAuth, async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }

        const emails = await googleService.searchEmails((req as AuthenticatedRequest).user!.id, query as string);
        res.json({ emails });
    } catch (error) {
        console.error('Search emails error:', error);
        res.status(500).json({ error: 'Failed to search emails' });
    }
});

router.get('/hubspot/search', requireHubspotAuth, async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }

        const contacts = await hubspotService.searchContacts((req as AuthenticatedRequest).user!.id, query as string);
        res.json({ contacts });
    } catch (error) {
        console.error('Search HubSpot contacts error:', error);
        res.status(500).json({ error: 'Failed to search contacts' });
    }
});

router.get('/gmail/recent', requireGoogleAuth, async (req, res) => {
    try {
        const emails = await prisma.emailMessage.findMany({
            where: { userId: (req as AuthenticatedRequest).user!.id },
            orderBy: { receivedAt: 'desc' },
            take: 10,
            select: {
                id: true,
                subject: true,
                from: true,
                receivedAt: true,
                isRead: true
            }
        });

        res.json({ emails });
    } catch (error) {
        console.error('Get recent emails error:', error);
        res.status(500).json({ error: 'Failed to get recent emails' });
    }
});

router.get('/calendar/upcoming', requireGoogleAuth, async (req, res) => {
    try {
        const now = new Date();
        const events = await prisma.calendarEvent.findMany({
            where: {
                userId: (req as AuthenticatedRequest).user!.id,
                startTime: {
                    gte: now
                }
            },
            orderBy: { startTime: 'asc' },
            take: 10
        });

        res.json({ events });
    } catch (error) {
        console.error('Get upcoming events error:', error);
        res.status(500).json({ error: 'Failed to get upcoming events' });
    }
});

router.get('/hubspot/contacts', requireHubspotAuth, async (req, res) => {
    try {
        const contacts = await prisma.hubspotContact.findMany({
            where: { userId: (req as AuthenticatedRequest).user!.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        res.json({ contacts });
    } catch (error) {
        console.error('Get HubSpot contacts error:', error);
        res.status(500).json({ error: 'Failed to get HubSpot contacts' });
    }
});

router.get('/hubspot/notes', requireHubspotAuth, async (req, res) => {
    try {
        const notes = await prisma.hubspotNote.findMany({
            where: { userId: (req as AuthenticatedRequest).user!.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
                contact: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });

        res.json({ notes });
    } catch (error) {
        console.error('Get HubSpot notes error:', error);
        res.status(500).json({ error: 'Failed to get HubSpot notes' });
    }
});

export default router; 