import { Router, Request, Response } from 'express';
import { GoogleService } from '../services/googleService.js';
import { HubspotService } from '../services/hubspotService.js';
import { AIService } from '../services/aiService.js';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const googleService = new GoogleService();
const hubspotService = new HubspotService();
const aiService = new AIService();

router.post('/gmail', async (req: Request, res: Response) => {
    try {
        const { message, userId } = req.body;

        await googleService.processWebhook(userId || 'system', message);

        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Gmail webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

router.post('/calendar', async (req: Request, res: Response) => {
    try {
        const { event, userId } = req.body;

        await googleService.processCalendarWebhook(userId || 'system', event);

        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Calendar webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

router.post('/hubspot', async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;

        await hubspotService.processWebhook(userId || 'system', req.body);

        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('HubSpot webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

router.post('/ai', async (req: Request, res: Response) => {
    try {
        const { userId, conversationId, message } = req.body;

        const response = await aiService.processMessage(userId, conversationId, message);

        res.status(200).json(response);
    } catch (error) {
        console.error('AI webhook error:', error);
        res.status(500).json({ error: 'AI processing failed' });
    }
});

router.get('/gmail/verify', (req: Request, res: Response) => {
    const { challenge } = req.query;
    if (challenge) {
        res.status(200).send(challenge);
    } else {
        res.status(400).json({ error: 'Challenge parameter required' });
    }
});

router.get('/calendar/verify', (req: Request, res: Response) => {
    const { challenge } = req.query;
    if (challenge) {
        res.status(200).send(challenge);
    } else {
        res.status(400).json({ error: 'Challenge parameter required' });
    }
});

export default router; 