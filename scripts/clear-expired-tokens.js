import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearExpiredTokens() {
    try {
        console.log('Clearing expired HubSpot tokens...');

        const result = await prisma.user.updateMany({
            where: {
                OR: [
                    { hubspotAccessToken: { not: null } },
                    { hubspotRefreshToken: { not: null } }
                ]
            },
            data: {
                hubspotAccessToken: null,
                hubspotRefreshToken: null,
                hubspotTokenExpiresAt: null,
                hubspotId: null,
                lastHubspotSync: null
            }
        });

        console.log(`Cleared HubSpot tokens for ${result.count} users`);
        console.log('Users will need to reconnect to HubSpot in the integrations page');

    } catch (error) {
        console.error('Error clearing expired tokens:', error);
    } finally {
        await prisma.$disconnect();
    }
}

clearExpiredTokens();