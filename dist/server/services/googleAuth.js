import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export function initializeGoogleAuth(passportInstance) {
    passportInstance.use(new GoogleStrategy({
        clientID: process.env['GOOGLE_CLIENT_ID'],
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
        callbackURL: process.env['GOOGLE_CALLBACK_URL'],
        scope: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events'
        ]
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            const name = profile.displayName;
            if (!email) {
                return done(new Error('Email not found in Google profile'), undefined);
            }
            let user = await prisma.user.findUnique({
                where: { email }
            });
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        email,
                        name,
                        googleId: profile.id,
                        accessToken,
                        refreshToken
                    }
                });
            }
            else {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        googleId: profile.id,
                        accessToken,
                        refreshToken
                    }
                });
            }
            return done(null, user);
        }
        catch (error) {
            console.error('Google OAuth error:', error);
            return done(error, undefined);
        }
    }));
    passportInstance.serializeUser((user, done) => {
        done(null, user.id);
    });
    passportInstance.deserializeUser(async (id, done) => {
        try {
            const user = await prisma.user.findUnique({
                where: { id }
            });
            done(null, user);
        }
        catch (error) {
            done(error, undefined);
        }
    });
}
