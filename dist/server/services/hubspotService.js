import { Client } from '@hubspot/api-client';
import { PrismaClient } from '@prisma/client';
import { APIErrorHandler, RateLimiter } from '../utils/apiErrorHandler.js';
const prisma = new PrismaClient();
export class HubspotService {
    constructor() {
        this.hubspotRateLimiter = RateLimiter.getInstance('hubspot', 50, 10000);
    }
    static async clearAllExpiredTokens() {
        try {
            console.log('Clearing all expired HubSpot tokens...');
            const result = await prisma.user.updateMany({
                where: {
                    OR: [
                        { hubspotAccessToken: { not: null } },
                        { hubspotRefreshToken: { not: null } }
                    ]
                },
                data: {
                    hubspotAccessToken: null,
                    hubspotRefreshToken: null
                }
            });
            console.log(`Cleared HubSpot tokens for ${result.count} users`);
        }
        catch (error) {
            console.error('Error clearing expired tokens:', error);
        }
    }
    static async clearRateLimiters() {
        try {
            console.log('Clearing all rate limiters...');
            const RateLimiterClass = (await import('../utils/apiErrorHandler.js')).RateLimiter;
            RateLimiterClass.instances?.clear();
            console.log('Rate limiters cleared');
        }
        catch (error) {
            console.error('Error clearing rate limiters:', error);
        }
    }
    async getClient(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                hubspotAccessToken: true,
                hubspotRefreshToken: true,
                hubspotTokenExpiresAt: true
            }
        });
        if (!user?.hubspotAccessToken) {
            throw new Error('HubSpot authentication required');
        }
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        if (user.hubspotTokenExpiresAt && user.hubspotTokenExpiresAt <= fiveMinutesFromNow) {
            if (!user.hubspotRefreshToken) {
                throw new Error('HubSpot re-authentication required - no refresh token available');
            }
            try {
                const refreshResult = await this.refreshAccessToken(user.hubspotRefreshToken);
                const expiresAt = new Date(Date.now() + (refreshResult.expiresIn * 1000));
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        hubspotAccessToken: refreshResult.accessToken,
                        hubspotRefreshToken: refreshResult.refreshToken,
                        hubspotTokenExpiresAt: expiresAt,
                    },
                });
                console.log(`HubSpot token refreshed for user ${userId}`);
                return new Client({ accessToken: refreshResult.accessToken });
            }
            catch (error) {
                console.error('Failed to refresh HubSpot token:', error);
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        hubspotAccessToken: null,
                        hubspotRefreshToken: null,
                        hubspotTokenExpiresAt: null,
                    },
                });
                if (error.message?.includes('Too many requests')) {
                    throw new Error('Too many requests to HubSpot. Please try again later.');
                }
                else {
                    throw new Error('HubSpot re-authentication required - token refresh failed');
                }
            }
        }
        return new Client({ accessToken: user.hubspotAccessToken });
    }
    async refreshAccessToken(refreshToken) {
        const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: process.env['HUBSPOT_CLIENT_ID'],
                client_secret: process.env['HUBSPOT_CLIENT_SECRET'],
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Too many requests to HubSpot. Please try again later.');
            }
            else {
                throw new Error('Failed to refresh HubSpot token');
            }
        }
        const data = await response.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in || 3600
        };
    }
    async searchContacts(userId, query) {
        return APIErrorHandler.withRetry(async () => {
            const client = await this.getClient(userId);
            const response = await client.crm.contacts.searchApi.doSearch({
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'email',
                                operator: 'CONTAINS_TOKEN',
                                value: query
                            }
                        ]
                    }
                ],
                sorts: [],
                after: 0,
                limit: 10,
                properties: ['firstname', 'lastname', 'email', 'company', 'phone', 'jobtitle', 'lifecyclestage', 'hs_lead_status']
            });
            return response.results.map((contact) => ({
                id: contact.id,
                email: contact.properties['email'],
                firstName: contact.properties['firstname'],
                lastName: contact.properties['lastname'],
                company: contact.properties['company'],
                phone: contact.properties['phone'],
                properties: contact.properties
            }));
        }, 'HubSpot', 3);
    }
    async createContact(userId, params) {
        return APIErrorHandler.withRetry(async () => {
            const client = await this.getClient(userId);
            const response = await client.crm.contacts.basicApi.create({
                properties: {
                    email: params.email || '',
                    firstname: params.firstName || '',
                    lastname: params.lastName || '',
                    company: params.company || ''
                },
                associations: []
            });
            await prisma.hubspotContact.create({
                data: {
                    userId,
                    hubspotId: response.id,
                    email: params.email ?? null,
                    firstName: params.firstName ?? null,
                    lastName: params.lastName ?? null,
                    company: params.company ?? null
                }
            });
            return {
                success: true,
                contactId: response.id,
                email: params.email
            };
        }, 'HubSpot', 3);
    }
    async syncContacts(userId) {
        return APIErrorHandler.withRetry(async () => {
            const client = await this.getClient(userId);
            let after = undefined;
            const limit = 100;
            do {
                const response = await client.crm.contacts.basicApi.getPage(limit, after, ['firstname', 'lastname', 'email', 'company', 'phone', 'jobtitle', 'lifecyclestage', 'hs_lead_status']);
                for (const contact of response.results) {
                    const existingContact = await prisma.hubspotContact.findUnique({
                        where: {
                            userId_hubspotId: {
                                userId,
                                hubspotId: contact.id
                            }
                        }
                    });
                    const contactData = {
                        userId,
                        hubspotId: contact.id,
                        email: contact.properties?.['email'] ?? null,
                        firstName: contact.properties?.['firstname'] ?? null,
                        lastName: contact.properties?.['lastname'] ?? null,
                        company: contact.properties?.['company'] ?? null,
                        phone: contact.properties?.['phone'] ?? null,
                        jobTitle: contact.properties?.['jobtitle'] ?? null,
                        lifecycleStage: contact.properties?.['lifecyclestage'] ?? null,
                        leadStatus: contact.properties?.['hs_lead_status'] ?? null,
                        properties: contact.properties
                    };
                    if (!existingContact) {
                        await prisma.hubspotContact.create({ data: contactData });
                    }
                    else {
                        await prisma.hubspotContact.update({
                            where: {
                                userId_hubspotId: {
                                    userId,
                                    hubspotId: contact.id
                                }
                            },
                            data: {
                                email: contactData.email,
                                firstName: contactData.firstName,
                                lastName: contactData.lastName,
                                company: contactData.company,
                                phone: contactData.phone,
                                jobTitle: contactData.jobTitle,
                                lifecycleStage: contactData.lifecycleStage,
                                leadStatus: contactData.leadStatus,
                                properties: contactData.properties,
                                updatedAt: new Date()
                            }
                        });
                    }
                }
                after = response.paging?.next?.after;
            } while (after);
        }, 'HubSpot', 3);
    }
    async syncNotes(userId) {
        return APIErrorHandler.withRetry(async () => {
            const client = await this.getClient(userId);
            const contacts = await prisma.hubspotContact.findMany({
                where: { userId }
            });
            console.log(`HubSpot notes sync: Processing ${contacts.length} contacts for user ${userId}`);
            let processedNotesCount = 0;
            for (const contact of contacts) {
                try {
                    const response = await client.crm.objects.notes.basicApi.getPage(100);
                    for (const note of response.results) {
                        const existingNote = await prisma.hubspotNote.findUnique({
                            where: { hubspotNoteId: note.id }
                        });
                        if (!existingNote) {
                            await prisma.hubspotNote.create({
                                data: {
                                    userId,
                                    contactId: contact.id,
                                    hubspotNoteId: note.id,
                                    content: note.properties?.['hs_note_body'] || ''
                                }
                            });
                            const aiService = new (await import('./aiService.js')).AIService();
                            await aiService.addDocumentToVectorStore(userId, note.properties?.['hs_note_body'] || '', {
                                source: 'hubspot_note',
                                id: note.id,
                                title: `Note for ${contact.firstName} ${contact.lastName}`,
                                date: note.properties?.['hs_timestamp'],
                                contactId: contact.id,
                                contactName: `${contact.firstName} ${contact.lastName}`.trim(),
                                hubspotContactId: contact.hubspotId
                            });
                            processedNotesCount++;
                            console.log(`HubSpot notes sync: Processed note ${processedNotesCount} for contact ${contact.firstName} ${contact.lastName}`);
                        }
                    }
                }
                catch (error) {
                    console.error(`Error syncing notes for contact ${contact.id}:`, error);
                }
            }
            console.log(`HubSpot notes sync completed: Processed ${processedNotesCount} new notes for user ${userId}`);
        }, 'HubSpot', 3);
    }
    async testConnection(userId) {
        try {
            const client = await this.getClient(userId);
            const accountInfo = await client.settings.users.usersApi.getPage();
            return {
                success: true,
                accountInfo: {
                    userCount: accountInfo.results.length,
                    hubId: 'Connected'
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to connect to HubSpot'
            };
        }
    }
    async processWebhook(userId, webhookData) {
        try {
            console.log('Processing HubSpot webhook for user:', userId);
            if (webhookData.subscriptionType) {
                await this.syncContacts(userId);
                await this.syncNotes(userId);
                const aiService = new (await import('./aiService.js')).AIService();
                await aiService.processWebhookWithInstructions(userId, 'hubspot', webhookData);
            }
        }
        catch (error) {
            console.error('Error processing HubSpot webhook:', error);
            throw error;
        }
    }
}
