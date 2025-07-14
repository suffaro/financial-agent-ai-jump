import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export function initializeHubspotAuth(passportInstance) {
    passportInstance.use('hubspot', new OAuth2Strategy({
        authorizationURL: 'https://app.hubspot.com/oauth/authorize',
        tokenURL: 'https://api.hubapi.com/oauth/v1/token',
        clientID: process.env['HUBSPOT_CLIENT_ID'],
        clientSecret: process.env['HUBSPOT_CLIENT_SECRET'],
        callbackURL: process.env['HUBSPOT_REDIRECT_URI'],
        scope: 'crm.objects.contacts.read crm.objects.contacts.write crm.schemas.contacts.read crm.schemas.contacts.write oauth'
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const response = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + accessToken);
            const userInfo = await response.json();
            const email = userInfo.user;
            if (!email) {
                return done(new Error('Email not found in HubSpot profile'), undefined);
            }
            let user = await prisma.user.findUnique({
                where: { email }
            });
            if (!user) {
                return done(new Error('User not found. Please authenticate with Google first.'), undefined);
            }
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    hubspotAccessToken: accessToken,
                    hubspotRefreshToken: refreshToken
                }
            });
            return done(null, user);
        }
        catch (error) {
            console.error('HubSpot OAuth error:', error);
            return done(error, undefined);
        }
    }));
}
