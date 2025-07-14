import { Router, Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { syncService } from '../services/syncService.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/google', passport.authenticate('google', {
    scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events'
    ],
    accessType: 'offline',
    prompt: 'consent'
}));

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    async (req: any, res: Response) => {
        try {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });

            if (!user) {
                const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
                return res.redirect(`${baseUrl}/login?error=user_not_found`);
            }

            const token = jwt.sign(
                { userId: user.id, email: user.email },
                process.env['JWT_SECRET'] || 'fallback-secret',
                { expiresIn: '7d' }
            );


            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
            const redirectUrl = `${baseUrl}/auth-callback?token=${token}`;

            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Google OAuth callback error:', error);
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
            res.redirect(`${baseUrl}/login?error=auth_failed`);
        }
    }
);

router.get('/hubspot', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    let userToken = token;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';

    if (!token) {
        const frontendToken = req.query.token as string;
        if (!frontendToken) {
            return res.redirect(`${baseUrl}/integrations?error=auth_required`);
        }

        try {
            const decoded = jwt.verify(frontendToken, process.env['JWT_SECRET'] || 'fallback-secret') as any;
            (req.session as any).user = { id: decoded.userId, email: decoded.email };
            userToken = frontendToken;
        } catch (error) {
            return res.redirect(`${baseUrl}/integrations?error=invalid_token`);
        }
    } else {
        try {
            const decoded = jwt.verify(token, process.env['JWT_SECRET'] || 'fallback-secret') as any;
            (req.session as any).user = { id: decoded.userId, email: decoded.email };
        } catch (error) {
            return res.redirect(`${baseUrl}/integrations?error=invalid_token`);
        }
    }

    const state = Buffer.from(userToken || '').toString('base64');
    const hubspotAuthUrl = `https://app.hubspot.com/oauth/authorize?client_id=${process.env['HUBSPOT_CLIENT_ID']}&redirect_uri=${process.env['HUBSPOT_REDIRECT_URI']}&scope=crm.objects.contacts.read%20crm.objects.contacts.write%20crm.schemas.contacts.read%20crm.schemas.contacts.write%20oauth&state=${state}`;
    res.redirect(hubspotAuthUrl);
});

router.get('/hubspot/callback', async (req: Request, res: Response) => {
    try {
        const { code, state, error } = req.query;
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';

        if (error) {
            console.error('HubSpot OAuth error:', error);
            return res.redirect(`${baseUrl}/integrations?error=hubspot_auth_cancelled`);
        }

        if (!code) {
            return res.redirect(`${baseUrl}/integrations?error=no_code`);
        }

        let userId: string;

        if (state) {
            try {
                const userToken = Buffer.from(state as string, 'base64').toString();
                const decoded = jwt.verify(userToken, process.env['JWT_SECRET'] || 'fallback-secret') as any;
                userId = decoded.userId;
            } catch (error) {
                console.error('Error decoding state:', error);
                return res.redirect(`${baseUrl}/integrations?error=invalid_state`);
            }
        } else {
            const sessionUser = (req.session as any)?.user;
            if (!sessionUser) {
                return res.redirect(`${baseUrl}/integrations?error=no_session`);
            }
            userId = sessionUser.id;
        }

        console.log(`Processing HubSpot callback for user ${userId}`);

        const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: process.env['HUBSPOT_CLIENT_ID']!,
                client_secret: process.env['HUBSPOT_CLIENT_SECRET']!,
                redirect_uri: process.env['HUBSPOT_REDIRECT_URI']!,
                code: code as string,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('HubSpot token error:', tokenData);
            return res.redirect(`${baseUrl}/integrations?error=hubspot_auth_failed`);
        }

        const expiresIn = (tokenData as any).expires_in || 1800;
        const expiresAt = new Date(Date.now() + (expiresIn * 1000));

        await prisma.user.update({
            where: { id: userId },
            data: {
                hubspotAccessToken: (tokenData as any).access_token,
                hubspotRefreshToken: (tokenData as any).refresh_token,
                hubspotTokenExpiresAt: expiresAt,
            },
        });

        const updatedUser = await prisma.user.findUnique({ where: { id: userId } });

        if (!updatedUser) {
            return res.redirect(`${baseUrl}/integrations?error=user_not_found`);
        }

        console.log(`HubSpot tokens saved for user ${userId}, starting sync...`);

        try {
            await syncService.startHubSpotSyncForUser(userId);
            console.log(`HubSpot sync initiated successfully for user ${userId}`);
        } catch (syncError) {
            console.error('Failed to start HubSpot sync:', syncError);
        }

        const newToken = jwt.sign(
            { userId: updatedUser.id, email: updatedUser.email },
            process.env['JWT_SECRET'] || 'fallback-secret',
            { expiresIn: '7d' }
        );

        const redirectUrl = `${baseUrl}/auth-callback?token=${newToken}`;
        res.redirect(redirectUrl);
    } catch (error) {
        console.error('HubSpot OAuth callback error:', error);
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        res.redirect(`${baseUrl}/integrations?error=hubspot_auth_failed`);
    }
});

router.post('/hubspot/disconnect', authenticateToken, async (req: any, res: Response) => {
    try {
        const userId = req.user.id;
        
        await syncService.stopSyncForUser(userId);
        
        await prisma.user.update({
            where: { id: userId },
            data: {
                hubspotAccessToken: null,
                hubspotRefreshToken: null,
                hubspotTokenExpiresAt: null,
                lastHubspotSync: null,
            },
        });

        console.log(`HubSpot disconnected successfully for user ${userId}`);
        res.json({ message: 'HubSpot disconnected successfully' });
    } catch (error) {
        console.error('HubSpot disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect HubSpot' });
    }
});

router.post('/logout', (req: Request, res: Response) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logout successful' });
    });
});

router.get('/me', authenticateToken, async (req: any, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                googleId: true,
                hubspotId: true,
                accessToken: true,
                hubspotAccessToken: true,
                createdAt: true,
            },
        });

        const userWithStatus = {
            ...user,
            isGoogleConnected: !!user?.accessToken,
            isHubspotConnected: !!user?.hubspotAccessToken,
        };

        res.json({ user: userWithStatus });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

export default router; 