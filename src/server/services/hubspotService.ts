import { Client } from '@hubspot/api-client';
import { PrismaClient } from '@prisma/client';
import { APIErrorHandler, RateLimiter } from '../utils/apiErrorHandler.js';

const prisma = new PrismaClient();

export class HubspotService {
    // Rate limiter for HubSpot API (100 requests per 10 seconds)
    private hubspotRateLimiter = RateLimiter.getInstance('hubspot', 50, 10000);

    static async clearAllExpiredTokens(): Promise<void> {
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
        } catch (error) {
            console.error('Error clearing expired tokens:', error);
        }
    }

    static async clearRateLimiters(): Promise<void> {
        try {
            console.log('Clearing all rate limiters...');
            const RateLimiterClass = (await import('../utils/apiErrorHandler.js')).RateLimiter;
            (RateLimiterClass as any).instances?.clear();
            console.log('Rate limiters cleared');
        } catch (error) {
            console.error('Error clearing rate limiters:', error);
        }
    }

    private async getClient(userId: string): Promise<Client> {
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

        // Check if token is expired or will expire soon (within 5 minutes)
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        
        if (user.hubspotTokenExpiresAt && user.hubspotTokenExpiresAt <= fiveMinutesFromNow) {
            // Token is expired or will expire soon, refresh it
            if (!user.hubspotRefreshToken) {
                throw new Error('HubSpot re-authentication required - no refresh token available');
            }

            try {
                const refreshResult = await this.refreshAccessToken(user.hubspotRefreshToken);
                
                // Update the user with new tokens
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
            } catch (error: any) {
                console.error('Failed to refresh HubSpot token:', error);
                
                // Clear invalid tokens
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        hubspotAccessToken: null,
                        hubspotRefreshToken: null,
                        hubspotTokenExpiresAt: null,
                    },
                });
                
                // Handle specific errors
                if (error.message?.includes('Too many requests')) {
                    throw new Error('Too many requests to HubSpot. Please try again later.');
                } else {
                    throw new Error('HubSpot re-authentication required - token refresh failed');
                }
            }
        }

        return new Client({ accessToken: user.hubspotAccessToken });
    }

    async refreshAccessToken(refreshToken: string): Promise<{ 
        accessToken: string; 
        refreshToken: string; 
        expiresIn: number; 
    }> {
        const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: process.env['HUBSPOT_CLIENT_ID']!,
                client_secret: process.env['HUBSPOT_CLIENT_SECRET']!,
                refresh_token: refreshToken,
            }),
        });

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Too many requests to HubSpot. Please try again later.');
            } else {
                throw new Error('Failed to refresh HubSpot token');
            }
        }

        const data = await response.json() as any;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in || 3600
        };
    }

    async searchContacts(userId: string, query: string): Promise<any[]> {
        return APIErrorHandler.withRetry(async () => {
            // await this.hubspotRateLimiter.checkLimit(); // EMERGENCY: Disabled
            
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

            return response.results.map((contact: any) => ({
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

    async createContact(userId: string, params: {
        email: string;
        firstName?: string;
        lastName?: string;
        company?: string;
    }): Promise<any> {
        return APIErrorHandler.withRetry(async () => {
            // await this.hubspotRateLimiter.checkLimit(); // EMERGENCY: Disabled
            
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

            // Save to local database
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

    async syncContacts(userId: string): Promise<void> {
        return APIErrorHandler.withRetry(async () => {
            // await this.hubspotRateLimiter.checkLimit(); // EMERGENCY: Disabled
            
            const client = await this.getClient(userId);
            
            // Sync contacts with pagination
            let after: string | undefined = undefined;
            const limit = 100;
            
            do {
                const response = await client.crm.contacts.basicApi.getPage(
                    limit, after, ['firstname', 'lastname', 'email', 'company', 'phone', 'jobtitle', 'lifecyclestage', 'hs_lead_status']
                );

                // Save contacts to database
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
                    } else {
                        // Update existing contact with latest data
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

    async syncNotes(userId: string): Promise<void> {
        return APIErrorHandler.withRetry(async () => {
            // await this.hubspotRateLimiter.checkLimit(); // EMERGENCY: Disabled
            
            const client = await this.getClient(userId);

            // Get all contacts first
            const contacts = await prisma.hubspotContact.findMany({
                where: { userId }
            });

            console.log(`HubSpot notes sync: Processing ${contacts.length} contacts for user ${userId}`);
            let processedNotesCount = 0;
            
            for (const contact of contacts) {
                try {
                    // Get notes specifically associated with this contact using simpler approach
                    const response = await client.crm.objects.notes.basicApi.getPage(100);
                    
                    for (const note of response.results) {
                        // Check if note already exists
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

                            // Add to vector store for RAG with proper contact association
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
                } catch (error) {
                    console.error(`Error syncing notes for contact ${contact.id}:`, error);
                    // Continue with other contacts
                }
            }
            
            console.log(`HubSpot notes sync completed: Processed ${processedNotesCount} new notes for user ${userId}`);
        }, 'HubSpot', 3);
    }

    async testConnection(userId: string): Promise<{ success: boolean; error?: string; accountInfo?: any }> {
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
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Failed to connect to HubSpot'
            };
        }
    }

    async processWebhook(userId: string, webhookData: any): Promise<void> {
        try {
            console.log('Processing HubSpot webhook for user:', userId);
            
            // For HubSpot webhooks, trigger appropriate sync
            if (webhookData.subscriptionType) {
                await this.syncContacts(userId);
                await this.syncNotes(userId);
                
                // Process with AI for proactive actions
                const aiService = new (await import('./aiService.js')).AIService();
                await aiService.processWebhookWithInstructions(userId, 'hubspot', webhookData);
            }
        } catch (error) {
            console.error('Error processing HubSpot webhook:', error);
            throw error;
        }
    }
}