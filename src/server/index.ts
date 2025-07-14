import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api', taskRoutes);
app.use('/api/integrations', authenticateToken, integrationRoutes);
app.use('/api/sync', authenticateToken, syncRoutes);
app.use('/api/instructions', authenticateToken, instructionRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/webhooks', webhookRoutes);

// Always serve static files in production-like environments
const buildPath = path.join(process.cwd(), 'client', 'build');
app.use(express.static(buildPath));

app.use(errorHandler);

// Handle React Router routes - this must come AFTER error handler
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

initializeWebhooks();

const PORT = process.env['PORT'] || 3001;

async function initializeDatabase() {
    try {
        console.log('🔧 Initializing database...');

        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Enable pgvector extension
        try {
            await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
            console.log('✅ pgvector extension enabled');
        } catch (error) {
            console.log('⚠️ pgvector extension setup:', error.message);
        }

        // Push database schema to create tables
        console.log('🗄️ Setting up database schema...');

        return new Promise((resolve, reject) => {
            const dbPush = spawn('npx', ['prisma', 'db', 'push', '--accept-data-loss'], {
                stdio: 'pipe',
                env: process.env
            });

            let output = '';

            dbPush.stdout.on('data', (data) => {
                output += data.toString();
                console.log(data.toString().trim());
            });

            dbPush.stderr.on('data', (data) => {
                console.error(data.toString().trim());
            });

            dbPush.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Database schema synchronized');
                    resolve(true);
                } else {
                    console.error('❌ Database schema sync failed with code:', code);
                    reject(new Error(`Database schema sync failed with code ${code}`));
                }
            });

            dbPush.on('error', (error) => {
                console.error('❌ Database schema sync error:', error);
                reject(error);
            });
        });

    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

// Check if tables exist by trying to query them
async function checkTablesExist() {
    try {
        await prisma.user.findFirst();
        return true;
    } catch (error) {
        if (error.code === 'P2021') {
            return false;
        }
        throw error;
    }
}

// Initialize services after database is ready
async function initializeServices() {
    try {
        console.log('🔄 Initializing services...');

        // Check if tables exist before trying to use them
        const tablesExist = await checkTablesExist();

        if (!tablesExist) {
            console.log('⚠️ Database tables not ready, skipping service initialization');
            return;
        }

        // Clear expired HubSpot tokens
        console.log('🧹 Clearing all expired HubSpot tokens...');
        try {
            await HubspotService.clearAllExpiredTokens();
            console.log('✅ Expired HubSpot tokens cleared');
        } catch (error) {
            console.error('Error clearing expired tokens:', error);
        }

        // Start sync service
        console.log('🔄 Starting sync service...');
        try {
            await syncService.syncAllUsers();
            console.log('✅ Sync service started');
        } catch (error) {
            console.error('Failed to sync all users:', error);
        }

    } catch (error) {
        console.error('❌ Service initialization failed:', error);
        // Don't throw here - let the server continue running
    }
}

async function startServer() {
    try {
        // Initialize database first
        await initializeDatabase();

        // Start the server
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Environment: ${process.env['NODE_ENV']}`);
            console.log(`🔗 Health check: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}/health`);
        });

        // Initialize services after server is running
        // Use a timeout to ensure server is fully ready
        setTimeout(async () => {
            await initializeServices();
        }, 3000);

        // Graceful shutdown handlers
        const gracefulShutdown = async (signal) => {
            console.log(`${signal} received, shutting down gracefully`);
            try {
                await syncService.stopAllSync();
                await prisma.$disconnect();
                server.close(() => {
                    console.log('✅ Server closed');
                    process.exit(0);
                });
            } catch (error) {
                console.error('Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

startServer();