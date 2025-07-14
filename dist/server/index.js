import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import taskRoutes from './routes/tasks.js';
import webhookRoutes from './routes/webhooks.js';
import integrationRoutes from './routes/integrations.js';
import syncRoutes from './routes/sync.js';
import instructionRoutes from './routes/instructions.js';
import settingsRoutes from './routes/settings.js';
import { authenticateToken } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeGoogleAuth } from './services/googleAuth.js';
import { initializeHubspotAuth } from './services/hubspotAuth.js';
import { initializeWebhooks } from './services/webhooks.js';
import { syncService } from './services/syncService.js';
import { HubspotService } from './services/hubspotService.js';
dotenv.config();
const app = express();
const prisma = new PrismaClient();
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use(helmet());
app.use(cors({
    origin: process.env['NODE_ENV'] === 'production'
        ? [process.env.FRONTEND_URL || 'https://your-domain.com', process.env.BACKEND_URL || 'https://your-api-domain.com']
        : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
    credentials: true
}));
app.use(compression());
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env['SESSION_SECRET'] || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env['NODE_ENV'] === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));
app.use(passport.initialize());
app.use(passport.session());
initializeGoogleAuth(passport);
initializeHubspotAuth(passport);
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env['NODE_ENV']
    });
});
app.use('/api/auth', authRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api', taskRoutes);
app.use('/api/integrations', authenticateToken, integrationRoutes);
app.use('/api/sync', authenticateToken, syncRoutes);
app.use('/api/instructions', authenticateToken, instructionRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/webhooks', webhookRoutes);
if (process.env['NODE_ENV'] === 'production') {
    app.use(express.static('client/build'));
    app.get('*', (req, res) => {
        res.sendFile('index.html', { root: 'client/build' });
    });
}
app.use(errorHandler);
initializeWebhooks();
const PORT = process.env['PORT'] || 3001;
async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
        console.log('✅ pgvector extension should be enabled');
        try {
            await HubspotService.clearAllExpiredTokens();
        }
        catch (error) {
            console.warn('⚠️ Could not clear expired HubSpot tokens:', error);
        }
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Environment: ${process.env['NODE_ENV']}`);
            console.log(`🔗 Health check: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}/health`);
        });
        console.log('🔄 Starting sync service...');
        await syncService.syncAllUsers();
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await syncService.stopAllSync();
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await syncService.stopAllSync();
    await prisma.$disconnect();
    process.exit(0);
});
startServer();
