import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { APIErrorHandler, RateLimiter } from '../utils/apiErrorHandler.js';

const prisma = new PrismaClient();

export class GoogleService {

    private gmailRateLimiter = RateLimiter.getInstance('gmail', 250, 100000);
    private calendarRateLimiter = RateLimiter.getInstance('calendar', 100, 100000);

    private getOAuth2Client(): OAuth2Client {
        return new google.auth.OAuth2(
            process.env['GOOGLE_CLIENT_ID'],
            process.env['GOOGLE_CLIENT_SECRET'],
            process.env['GOOGLE_CALLBACK_URL']
        );
    }

    private async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { accessToken: true, refreshToken: true }
        });

        if (!user?.accessToken) {
            throw new Error('Google authentication required');
        }

        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: user.accessToken,
            refresh_token: user.refreshToken
        });

        return oauth2Client;
    }

    async searchEmails(userId: string, query: string): Promise<any[]> {
        return APIErrorHandler.withRetry(async () => {
            // await this.gmailRateLimiter.checkLimit(); // EMERGENCY: Disabled

            const auth = await this.getAuthenticatedClient(userId);
            const gmail = google.gmail({ version: 'v1', auth });

            const response = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 10
            });

            const messages = response.data.messages || [];
            const detailedMessages: any[] = [];

            for (const message of messages) {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id!
                });

                const headers = detail.data.payload?.headers;
                const subject = headers?.find(h => h.name === 'Subject')?.value || '';
                const from = headers?.find(h => h.name === 'From')?.value || '';
                const date = headers?.find(h => h.name === 'Date')?.value || '';


                let body = '';
                if (detail.data.payload?.body?.data) {
                    body = Buffer.from(detail.data.payload.body.data, 'base64').toString();
                } else if (detail.data.payload?.parts) {
                    const textPart = detail.data.payload.parts.find(part =>
                        part.mimeType === 'text/plain'
                    );
                    if (textPart?.body?.data) {
                        body = Buffer.from(textPart.body.data, 'base64').toString();
                    }
                }

                detailedMessages.push({
                    id: message.id,
                    subject,
                    from,
                    date,
                    body: body.slice(0, 500) + (body.length > 500 ? '...' : ''),
                    snippet: detail.data.snippet
                });
            }

            return detailedMessages;
        }, 'Gmail', 3);
    }

    async sendEmail(userId: string, params: { to: string; subject: string; body: string }): Promise<any> {
        return APIErrorHandler.withRetry(async () => {
            // await this.gmailRateLimiter.checkLimit(); // EMERGENCY: Disabled

            const auth = await this.getAuthenticatedClient(userId);
            const gmail = google.gmail({ version: 'v1', auth });

            const email = [
                `To: ${params.to}`,
                `Subject: ${params.subject}`,
                '',
                params.body
            ].join('\n');

            const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedEmail
                }
            });

            return {
                success: true,
                messageId: response.data.id,
                threadId: response.data.threadId
            };
        }, 'Gmail', 3);
    }

    async scheduleMeeting(userId: string, params: {
        contactName: string;
        subject: string;
        duration?: number;
        message?: string;
    }): Promise<any> {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const calendar = google.calendar({ version: 'v3', auth });


            const hubspotService = new (await import('./hubspotService.js')).HubspotService();
            const contacts = await hubspotService.searchContacts(userId, params.contactName);

            if (contacts.length === 0) {
                throw new Error(`Contact "${params.contactName}" not found in HubSpot`);
            }

            const contact = contacts[0];
            const contactEmail = contact.email || contact.properties?.email;

            if (!contactEmail) {
                throw new Error(`No email found for contact "${params.contactName}"`);
            }


            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);

            const endDate = new Date(tomorrow);
            endDate.setDate(endDate.getDate() + 7);

            const events = await calendar.events.list({
                calendarId: 'primary',
                timeMin: tomorrow.toISOString(),
                timeMax: endDate.toISOString(),
                singleEvents: true,
                orderBy: 'startTime'
            });


            const availableSlots = this.findAvailableSlots(events.data.items || [], tomorrow, endDate);

            if (availableSlots.length === 0) {
                throw new Error('No available time slots found');
            }


            const event = {
                summary: params.subject,
                description: params.message || `Meeting with ${params.contactName}`,
                start: {
                    dateTime: availableSlots[0].start.toISOString(),
                    timeZone: 'America/New_York'
                },
                end: {
                    dateTime: availableSlots[0].end.toISOString(),
                    timeZone: 'America/New_York'
                },
                attendees: [
                    { email: contactEmail }
                ],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 10 }
                    ]
                }
            };

            const createdEvent = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: event,
                sendUpdates: 'all'
            });


            const emailBody = `Hi ${params.contactName},

I'd like to schedule a meeting with you to discuss ${params.subject}.

I've scheduled it for ${availableSlots[0].start.toLocaleString()} - ${availableSlots[0].end.toLocaleString()}.

Please let me know if this time works for you, or if you'd prefer a different time.

Best regards,
[Your Name]`;

            await this.sendEmail(userId, {
                to: contactEmail,
                subject: `Meeting Request: ${params.subject}`,
                body: emailBody
            });

            return {
                success: true,
                eventId: createdEvent.data.id,
                eventLink: createdEvent.data.htmlLink,
                scheduledTime: availableSlots[0].start.toISOString()
            };
        } catch (error) {
            console.error('Schedule meeting error:', error);
            throw error;
        }
    }

    private findAvailableSlots(existingEvents: any[], startDate: Date, endDate: Date): Array<{ start: Date, end: Date }> {
        const slots: Array<{ start: Date, end: Date }> = [];
        const businessHours = { start: 9, end: 17 };
        const slotDuration = 30;

        for (let day = new Date(startDate); day < endDate; day.setDate(day.getDate() + 1)) {
            if (day.getDay() === 0 || day.getDay() === 6) continue;

            for (let hour = businessHours.start; hour < businessHours.end; hour++) {
                for (let minute = 0; minute < 60; minute += slotDuration) {
                    const slotStart = new Date(day);
                    slotStart.setHours(hour, minute, 0, 0);

                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);


                    const hasConflict = existingEvents.some(event => {
                        const eventStart = new Date(event.start.dateTime || event.start.date);
                        const eventEnd = new Date(event.end.dateTime || event.end.date);

                        return (slotStart < eventEnd && slotEnd > eventStart);
                    });

                    if (!hasConflict) {
                        slots.push({ start: slotStart, end: slotEnd });
                    }
                }
            }
        }

        return slots.slice(0, 5);
    }

    async syncEmails(userId: string): Promise<void> {
        return APIErrorHandler.withRetry(async () => {
            // await this.gmailRateLimiter.checkLimit(); // EMERGENCY: Disabled

            const auth = await this.getAuthenticatedClient(userId);
            const gmail = google.gmail({ version: 'v1', auth });

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, lastEmailSync: true }
            });

            let query = 'in:inbox OR in:sent';
            if (user?.lastEmailSync) {
                const lastSyncDate = Math.floor(user.lastEmailSync.getTime() / 1000);
                query = `${query} after:${lastSyncDate}`;
            }

            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 30,
                q: query
            });

            const messages = response.data.messages || [];
            console.log(`Gmail sync: Found ${messages.length} emails to process for user ${userId}`);

            let processedCount = 0;
            for (const message of messages) {

                const existingEmail = await prisma.emailMessage.findUnique({
                    where: { gmailId: message.id! }
                });

                if (!existingEmail) {
                    processedCount++;
                    console.log(`Gmail sync: Processing email ${processedCount}/${messages.length} for user ${userId}`);

                    const detail = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id!
                    });

                    const headers = detail.data.payload?.headers;
                    const subject = headers?.find(h => h.name === 'Subject')?.value || '';
                    const from = headers?.find(h => h.name === 'From')?.value || '';
                    const to = headers?.find(h => h.name === 'To')?.value || '';
                    const cc = headers?.find(h => h.name === 'Cc')?.value || '';
                    const date = headers?.find(h => h.name === 'Date')?.value || '';

                    const userEmail = user?.email?.toLowerCase() || '';

                    const isSentEmail = from.toLowerCase().includes(userEmail);

                    if (!isSentEmail) {
                        const fromLower = from.toLowerCase();

                        const obviousSpamPatterns = [
                            /noreply@|no-reply@|donotreply@/i,
                            /@.*\.epicentrk\./i
                        ];

                        const isObviousSpam = obviousSpamPatterns.some(pattern => pattern.test(fromLower));

                        if (isObviousSpam) {
                            console.log(`Skipping obvious spam email: ${subject} from ${from}`);
                            continue;
                        }
                    }

                    let body = '';
                    if (detail.data.payload?.body?.data) {
                        body = Buffer.from(detail.data.payload.body.data, 'base64').toString();
                    } else if (detail.data.payload?.parts) {
                        const textPart = detail.data.payload.parts.find(part =>
                            part.mimeType === 'text/plain'
                        );
                        if (textPart?.body?.data) {
                            body = Buffer.from(textPart.body.data, 'base64').toString();
                        }
                    }

                    await prisma.emailMessage.create({
                        data: {
                            userId,
                            gmailId: message.id!,
                            threadId: message.threadId ?? null,
                            from,
                            to: to ? [to] : [],
                            cc: cc ? [cc] : [],
                            bcc: [],
                            subject,
                            body,
                            receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
                            labels: message.labelIds || [],
                            isRead: !detail.data.labelIds?.includes('UNREAD') || false,
                            isArchived: detail.data.labelIds?.includes('INBOX') === false || false
                        }
                    });

                    const aiService = new (await import('./aiService.js')).AIService();
                    await aiService.addDocumentToVectorStore(userId, body, {
                        source: 'email',
                        id: message.id,
                        title: subject,
                        date: date,
                        from: from,
                        direction: isSentEmail ? 'sent' : 'received',
                        isSentEmail: isSentEmail
                    });

                    await aiService.processWebhookWithInstructions(userId, 'email', {
                        type: 'new_email',
                        email: { subject, from, to, body, receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date() }
                    });
                }
            }

            await prisma.user.update({
                where: { id: userId },
                data: { lastEmailSync: new Date() }
            });

            console.log(`Gmail sync completed: Processed ${processedCount} new emails for user ${userId}`);
        }, 'Gmail', 3);
    }

    async syncCalendar(userId: string): Promise<void> {
        return APIErrorHandler.withRetry(async () => {
            // await this.calendarRateLimiter.checkLimit(); // EMERGENCY: Disabled

            const auth = await this.getAuthenticatedClient(userId);
            const calendar = google.calendar({ version: 'v3', auth });


            const now = new Date();
            const startDate = new Date(now);
            startDate.setFullYear(startDate.getFullYear() - 1);

            const endDate = new Date(now);
            endDate.setFullYear(endDate.getFullYear() + 1);


            let allEvents: any[] = [];
            let pageToken: string | undefined = undefined;

            do {
                const response = await calendar.events.list({
                    calendarId: 'primary',
                    timeMin: startDate.toISOString(),
                    timeMax: endDate.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 30,
                    pageToken: pageToken
                });

                const events = response.data.items || [];
                allEvents = allEvents.concat(events);
                pageToken = response.data.nextPageToken || undefined;

                console.log(`Synced ${events.length} calendar events (total: ${allEvents.length})`);
            } while (pageToken);

            const events = allEvents;
            let processedCount = 0;

            for (const event of events) {
                if (!event.id) continue;

                const existingEvent = await prisma.calendarEvent.findUnique({
                    where: { googleEventId: event.id }
                });

                if (!event.start?.dateTime && !event.start?.date) {
                    console.log(`Skipping event with no start time: ${event.summary}`);
                    continue;
                }

                if (!event.end?.dateTime && !event.end?.date) {
                    console.log(`Skipping event with no end time: ${event.summary}`);
                    continue;
                }

                const eventData = {
                    userId,
                    googleEventId: event.id,
                    title: event.summary || 'No Title',
                    description: event.description || '',
                    startTime: new Date(event.start.dateTime || event.start.date!),
                    endTime: new Date(event.end.dateTime || event.end.date!),
                    attendees: event.attendees?.map((a: any) => a.email || '') || [],
                    location: event.location || '',
                    isAllDay: !event.start.dateTime
                };

                if (!existingEvent) {
                    await prisma.calendarEvent.create({ data: eventData });
                    processedCount++;
                } else {
                    await prisma.calendarEvent.update({
                        where: { googleEventId: event.id },
                        data: {
                            title: eventData.title,
                            description: eventData.description,
                            startTime: eventData.startTime,
                            endTime: eventData.endTime,
                            attendees: eventData.attendees,
                            location: eventData.location,
                            isAllDay: eventData.isAllDay,
                            updatedAt: new Date()
                        }
                    });
                    processedCount++;
                }
            }

            console.log(`Calendar sync completed: Processed ${processedCount} events for user ${userId}`);
        }, 'Google Calendar', 3);
    }

    async processWebhook(userId: string, webhookData: any): Promise<void> {
        try {
            console.log('Processing Gmail webhook for user:', userId);


            if (webhookData.emailAddress) {
                await this.syncEmails(userId);


                const aiService = new (await import('./aiService.js')).AIService();
                await aiService.processWebhookWithInstructions(userId, 'gmail', webhookData);
            }
        } catch (error) {
            console.error('Error processing Gmail webhook:', error);
            throw error;
        }
    }

    async processCalendarWebhook(userId: string, webhookData: any): Promise<void> {
        try {
            console.log('Processing Calendar webhook for user:', userId);


            await this.syncCalendar(userId);


            const aiService = new (await import('./aiService.js')).AIService();
            await aiService.processWebhookWithInstructions(userId, 'calendar', webhookData);
        } catch (error) {
            console.error('Error processing Calendar webhook:', error);
            throw error;
        }
    }

    async createCalendarEvent(userId: string, params: {
        title: string,
        description?: string,
        startTime: string,
        endTime: string,
        attendees?: string[],
        location?: string
    }): Promise<{ success: boolean; event?: any; error?: string }> {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            if (!auth) {
                return { success: false, error: 'Google Calendar not connected' };
            }

            const calendar = google.calendar({ version: 'v3', auth });


            const startDate = new Date(params.startTime);
            const endDate = new Date(params.endTime);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                throw new Error(`Invalid date format. StartTime: ${params.startTime}, EndTime: ${params.endTime}`);
            }

            const event = {
                summary: params.title,
                description: params.description || '',
                location: params.location || '',
                start: {
                    dateTime: startDate.toISOString(),
                    timeZone: 'America/New_York'
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: 'America/New_York'
                },
                attendees: params.attendees?.map(email => ({ email })) || [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 10 }
                    ]
                }
            };

            const createdEvent = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: event,
                sendUpdates: 'all'
            });


            await prisma.calendarEvent.create({
                data: {
                    userId,
                    googleEventId: createdEvent.data.id!,
                    title: params.title,
                    description: params.description || '',
                    startTime: startDate,
                    endTime: endDate,
                    attendees: params.attendees || [],
                    location: params.location || '',
                    isAllDay: false
                }
            });

            return {
                success: true,
                event: createdEvent.data
            };
        } catch (error) {
            console.error('Error creating calendar event:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create calendar event'
            };
        }
    }

    async deleteCalendarEvent(userId: string, eventId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            if (!auth) {
                return { success: false, error: 'Google Calendar not connected' };
            }

            const calendar = google.calendar({ version: 'v3', auth });

            await calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
                sendUpdates: 'all'
            });

            return { success: true };
        } catch (error) {
            console.error('Error deleting calendar event:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete calendar event'
            };
        }
    }
} 