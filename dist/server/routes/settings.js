import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { setupGmailWebhook, setupCalendarWebhook, setupHubspotWebhook } from '../services/webhooks.js';
const router = Router();
const prisma = new PrismaClient();
router.get('/', async (req, res) => {
    try {
        const user = req.user;
        const userData = await prisma.user.findUnique({
            where: { id: user.id },
            select: { settings: true }
        });
        const defaultSettings = {
            showDebugInfo: false,
            autoSync: true,
            useWebhooks: false
        };
        res.json({
            settings: userData?.settings || defaultSettings
        });
    }
    catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});
router.put('/', async (req, res) => {
    try {
        const user = req.user;
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Invalid settings data' });
        }
        const currentUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                settings: true,
                accessToken: true,
                hubspotAccessToken: true
            }
        });
        const currentSettings = currentUser?.settings || {};
        const newUseWebhooks = settings.useWebhooks;
        const currentUseWebhooks = currentSettings.useWebhooks;
        await prisma.user.update({
            where: { id: user.id },
            data: { settings }
        });
        if (newUseWebhooks !== currentUseWebhooks) {
            if (newUseWebhooks) {
                console.log(`Setting up webhooks for user ${user.id}`);
                const webhookResults = {
                    gmail: null,
                    calendar: null,
                    hubspot: null
                };
                if (currentUser?.accessToken) {
                    try {
                        webhookResults.gmail = await setupGmailWebhook(currentUser.accessToken, user.id);
                        console.log('Gmail webhook setup completed');
                    }
                    catch (error) {
                        console.error('Failed to setup Gmail webhook:', error);
                        webhookResults.gmail = { error: 'Setup failed' };
                    }
                }
                if (currentUser?.accessToken) {
                    try {
                        webhookResults.calendar = await setupCalendarWebhook(currentUser.accessToken, user.id);
                        console.log('Calendar webhook setup completed');
                    }
                    catch (error) {
                        console.error('Failed to setup Calendar webhook:', error);
                        webhookResults.calendar = { error: 'Setup failed' };
                    }
                }
                if (currentUser?.hubspotAccessToken) {
                    try {
                        webhookResults.hubspot = await setupHubspotWebhook(currentUser.hubspotAccessToken, user.id);
                        console.log('HubSpot webhook setup completed');
                    }
                    catch (error) {
                        console.error('Failed to setup HubSpot webhook:', error);
                        webhookResults.hubspot = { error: 'Setup failed' };
                    }
                }
                res.json({
                    message: 'Settings updated and webhooks configured',
                    settings,
                    webhooks: webhookResults
                });
            }
            else {
                console.log(`Tearing down webhooks for user ${user.id}`);
                console.log('Webhook teardown would happen here in production');
                res.json({
                    message: 'Settings updated and webhooks disabled',
                    settings
                });
            }
        }
        else {
            res.json({
                message: 'Settings updated successfully',
                settings
            });
        }
    }
    catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
export default router;
