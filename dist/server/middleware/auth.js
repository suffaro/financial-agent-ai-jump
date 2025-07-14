import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }
    jwt.verify(token, process.env['JWT_SECRET'] || 'fallback-secret', async (err, decoded) => {
        if (err) {
            console.error('Authentication error:', err);
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        try {
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId }
            });
            if (!user) {
                res.status(401).json({ error: 'User not found' });
                return;
            }
            req.user = {
                id: user.id,
                email: user.email,
                name: user.name,
                accessToken: user.accessToken,
                hubspotAccessToken: user.hubspotAccessToken
            };
            next();
        }
        catch (error) {
            console.error('Database error during authentication:', error);
            res.status(500).json({ error: 'Authentication failed' });
        }
    });
};
export const requireGoogleAuth = (req, res, next) => {
    if (!req.user?.accessToken) {
        res.status(401).json({ error: 'Google authentication required' });
        return;
    }
    next();
};
export const requireHubspotAuth = async (req, res, next) => {
    const user = req.user;
    if (!user?.hubspotAccessToken) {
        res.status(401).json({
            error: 'HubSpot authentication required',
            code: 'HUBSPOT_AUTH_REQUIRED'
        });
        return;
    }
    try {
        const response = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${user.hubspotAccessToken}`);
        if (!response.ok) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    hubspotAccessToken: null,
                    hubspotRefreshToken: null,
                    hubspotTokenExpiresAt: null
                }
            });
            res.status(401).json({
                error: 'HubSpot token expired. Please reconnect.',
                code: 'HUBSPOT_TOKEN_EXPIRED'
            });
            return;
        }
        const tokenInfo = await response.json();
        if (tokenInfo.expires_in && tokenInfo.expires_in < 3600) {
            console.warn(`HubSpot token for user ${user.id} expires in ${tokenInfo.expires_in} seconds`);
        }
        next();
    }
    catch (error) {
        console.error('Error validating HubSpot token:', error);
        next();
    }
};
