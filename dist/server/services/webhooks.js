import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { AIService } from './aiService.js';
const prisma = new PrismaClient();
const aiService = new AIService();
export async function areWebhooksEnabled(userId) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { settings: true }
        });
        const settings = user?.settings;
        return settings?.useWebhooks || false;
    }
    catch (error) {
        console.error('Failed to check webhook settings:', error);
        return false;
    }
}
export async function initializeWebhooks() {
    try {
        console.log('Initializing webhooks...');
        const requiredEnvVars = ['GOOGLE_PROJECT_ID', 'BASE_URL'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            console.warn(`⚠️ Webhook configuration incomplete. Missing environment variables: ${missingVars.join(', ')}`);
            console.warn('Webhooks will be available but may have limited functionality.');
        }
        else {
            console.log('✅ Webhook environment configuration looks good');
        }
        console.log('Webhooks initialized successfully');
    }
    catch (error) {
        console.error('Failed to initialize webhooks:', error);
    }
}
export async function setupGmailWebhook(accessToken, userId) {
    try {
        if (!(await areWebhooksEnabled(userId))) {
            console.log('Webhooks disabled for user, skipping Gmail webhook setup');
            return { disabled: true };
        }
        const projectId = process.env['GOOGLE_PROJECT_ID'];
        if (!projectId) {
            console.log('GOOGLE_PROJECT_ID not configured, skipping Gmail webhook setup');
            return {
                skipped: true,
                reason: 'Google Cloud Project ID not configured. Gmail webhooks require Google Cloud Pub/Sub setup.'
            };
        }
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: 'v1', auth });
        const response = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: `projects/${projectId}/topics/gmail-notifications`,
                labelIds: ['INBOX']
            }
        });
        console.log('Gmail webhook set up successfully');
        return { success: true, data: response.data };
    }
    catch (error) {
        console.error('Failed to set up Gmail webhook:', error);
        return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error',
            details: 'Gmail webhooks require Google Cloud Pub/Sub topic configuration'
        };
    }
}
export async function setupCalendarWebhook(accessToken, userId) {
    try {
        if (!(await areWebhooksEnabled(userId))) {
            console.log('Webhooks disabled for user, skipping Calendar webhook setup');
            return { disabled: true };
        }
        const baseUrl = process.env['BASE_URL'];
        if (!baseUrl) {
            console.log('BASE_URL not configured, skipping Calendar webhook setup');
            return {
                skipped: true,
                reason: 'BASE_URL environment variable not configured for webhook endpoints.'
            };
        }
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth });
        const response = await calendar.events.watch({
            calendarId: 'primary',
            requestBody: {
                id: `calendar-webhook-${userId}-${Date.now()}`,
                type: 'web_hook',
                address: `${baseUrl}/api/webhooks/calendar`,
                params: {
                    ttl: '86400'
                }
            }
        });
        console.log('Calendar webhook set up successfully');
        return { success: true, data: response.data };
    }
    catch (error) {
        console.error('Failed to set up Calendar webhook:', error);
        return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error',
            details: 'Calendar webhooks require a publicly accessible BASE_URL'
        };
    }
}
export async function setupHubspotWebhook(accessToken, userId) {
    try {
        if (!(await areWebhooksEnabled(userId))) {
            console.log('Webhooks disabled for user, skipping HubSpot webhook setup');
            return { disabled: true };
        }
        const baseUrl = process.env['BASE_URL'];
        if (!baseUrl) {
            console.log('BASE_URL not configured, skipping HubSpot webhook setup');
            return {
                skipped: true,
                reason: 'BASE_URL environment variable not configured for webhook endpoints.'
            };
        }
        console.log('HubSpot webhook setup simulated (requires production configuration)');
        return {
            simulated: true,
            message: 'HubSpot webhook setup requires production configuration with proper portal ID and subscription management.',
            webhookUrl: `${baseUrl}/api/webhooks/hubspot`
        };
    }
    catch (error) {
        console.error('Failed to set up HubSpot webhook:', error);
        return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error',
            details: 'HubSpot webhooks require proper portal ID and subscription configuration'
        };
    }
}
export async function processWebhookEvent(eventId) {
    try {
        const event = await prisma.webhookEvent.findUnique({
            where: { id: eventId }
        });
        if (!event) {
            throw new Error('Webhook event not found');
        }
        await prisma.webhookEvent.update({
            where: { id: eventId },
            data: { processed: true }
        });
        switch (event.source) {
            case 'gmail':
                await processGmailWebhookEvent(event);
                break;
            case 'calendar':
                await processCalendarWebhookEvent(event);
                break;
            case 'hubspot':
                await processHubspotWebhookEvent(event);
                break;
            default:
                console.warn(`Unknown webhook source: ${event.source}`);
        }
    }
    catch (error) {
        console.error('Process webhook event error:', error);
    }
}
async function processGmailWebhookEvent(event) {
    console.log('Processing Gmail webhook event:', event.id);
    try {
        const userId = event.userId;
        if (!userId) {
            console.error('No userId found in Gmail webhook event');
            return;
        }
        await aiService.processWebhookWithInstructions(userId, 'gmail', {
            type: 'email_received',
            eventId: event.id,
            data: event.data
        });
    }
    catch (error) {
        console.error('Error processing Gmail webhook with AI:', error);
    }
}
async function processCalendarWebhookEvent(event) {
    console.log('Processing Calendar webhook event:', event.id);
    try {
        const userId = event.userId;
        if (!userId) {
            console.error('No userId found in Calendar webhook event');
            return;
        }
        await aiService.processWebhookWithInstructions(userId, 'calendar', {
            type: 'calendar_event_created',
            eventId: event.id,
            data: event.data
        });
    }
    catch (error) {
        console.error('Error processing Calendar webhook with AI:', error);
    }
}
async function processHubspotWebhookEvent(event) {
    console.log('Processing HubSpot webhook event:', event.id);
    try {
        const userId = event.userId;
        if (!userId) {
            console.error('No userId found in HubSpot webhook event');
            return;
        }
        await aiService.processWebhookWithInstructions(userId, 'hubspot', {
            type: 'contact_created',
            eventId: event.id,
            data: event.data
        });
    }
    catch (error) {
        console.error('Error processing HubSpot webhook with AI:', error);
    }
}
