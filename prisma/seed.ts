import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    const user = await prisma.user.findFirst();
    if (!user) {
        console.log('No user found. Please create a user first.');
        return;
    }

    console.log(`Found user: ${user.email}`);

    await prisma.emailMessage.createMany({
        data: [
            {
                userId: user.id,
                gmailId: 'email1',
                subject: 'Baseball game this weekend',
                from: 'john.smith@example.com',
                to: [user.email],
                body: 'Hey Jim, my kid is playing baseball this weekend. Would love to discuss the portfolio after the game.',
                receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
                threadId: 'thread1'
            },
            {
                userId: user.id,
                gmailId: 'email2',
                subject: 'AAPL Stock Question',
                from: 'greg.wilson@example.com',
                to: [user.email],
                body: 'Hi Jim, I\'ve been thinking about selling my AAPL stock. The market seems volatile lately.',
                receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
                threadId: 'thread2'
            },
            {
                userId: user.id,
                gmailId: 'email3',
                subject: 'Portfolio Review Meeting',
                from: 'sara.smith@example.com',
                to: [user.email],
                body: 'Jim, can we schedule a meeting to review my portfolio? I have some questions about my retirement planning.',
                receivedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
                threadId: 'thread3'
            }
        ],
        skipDuplicates: true
    });

    await prisma.hubspotContact.createMany({
        data: [
            {
                userId: user.id,
                hubspotId: 'contact1',
                firstName: 'John',
                lastName: 'Smith',
                email: 'john.smith@example.com',
                phone: '+1-555-0123',
                company: 'Smith Enterprises'
            },
            {
                userId: user.id,
                hubspotId: 'contact2',
                firstName: 'Greg',
                lastName: 'Wilson',
                email: 'greg.wilson@example.com',
                phone: '+1-555-0456',
                company: 'Wilson & Co'
            },
            {
                userId: user.id,
                hubspotId: 'contact3',
                firstName: 'Sara',
                lastName: 'Smith',
                email: 'sara.smith@example.com',
                phone: '+1-555-0789',
                company: 'Independent'
            },
            {
                userId: user.id,
                hubspotId: 'contact4',
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                phone: '+1-555-1111',
                company: 'Doe Industries'
            }
        ],
        skipDuplicates: true
    });

    console.log('Seeding completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });