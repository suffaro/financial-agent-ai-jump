import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AIService } from '../services/aiService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();
const aiService = new AIService();

router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        await prisma.conversation.deleteMany({
            where: {
                userId: user.id,
                createdAt: { lt: oneHourAgo },
                messages: { none: {} }
            }
        });

        const conversations = await prisma.conversation.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: 'desc' },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        res.json({ conversations });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

router.get('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { conversationId } = req.params;

        const messages = await prisma.message.findMany({
            where: {
                conversationId,
                conversation: { userId: user.id }
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json({ messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

router.post('/conversations', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { title } = req.body;

        const conversation = await prisma.conversation.create({
            data: {
                userId: user.id,
                title: title || 'New Conversation'
            }
        });

        res.json({ conversation });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

router.post('/conversations/start', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { content, context } = req.body;

        // Validate input
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        if (content.length > 10000) {
            return res.status(400).json({ error: 'Message content too long (max 10000 characters)' });
        }

        const conversation = await prisma.conversation.create({
            data: {
                userId: user.id,
                title: 'New Conversation'
            }
        });

        const userMessage = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: 'user' as const,
                content
            }
        });

        let timeoutId: NodeJS.Timeout;
        const aiResponse = await Promise.race([
            aiService.processMessage(user.id, conversation.id, content, context),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('AI response timeout')), 30000);
            })
        ]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
        }) as any;

        const assistantMessage = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: 'assistant' as const,
                content: aiResponse.content,
                toolCalls: aiResponse.toolCalls ? JSON.parse(JSON.stringify(aiResponse.toolCalls)) : null
            }
        });

        const title = content.length > 50
            ? content.substring(0, 50) + '...'
            : content;

        await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                title,
                updatedAt: new Date()
            }
        });

        res.json({
            conversation,
            userMessage,
            assistantMessage
        });
    } catch (error) {
        console.error('Start conversation error:', error);
        res.status(500).json({ error: 'Failed to start conversation' });
    }
});

router.post('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { conversationId } = req.params;
        const { content, context } = req.body;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            res.status(400).json({ error: 'Message content is required' });
            return;
        }

        if (content.length > 10000) {
            res.status(400).json({ error: 'Message content too long (max 10000 characters)' });
            return;
        }

        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                userId: user.id
            }
        });

        if (!conversation) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }

        const userMessage = await prisma.message.create({
            data: {
                conversationId,
                role: 'user' as const,
                content
            }
        });

        let timeoutId: NodeJS.Timeout;
        const aiResponse = await Promise.race([
            aiService.processMessage(user.id, conversationId, content, context),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('AI response timeout')), 30000);
            })
        ]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
        }) as any;

        const assistantMessage = await prisma.message.create({
            data: {
                conversationId,
                role: 'assistant' as const,
                content: aiResponse.content,
                toolCalls: aiResponse.toolCalls ? JSON.parse(JSON.stringify(aiResponse.toolCalls)) : null
            }
        });

        const conversationWithMessages = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { messages: true }
        });

        let updateData: { updatedAt: Date; title?: string } = { updatedAt: new Date() };

        if (conversationWithMessages && conversationWithMessages.messages.length <= 2) {
            const firstUserMessage = conversationWithMessages.messages.find(m => m.role === 'user');
            if (firstUserMessage) {
                const title = firstUserMessage.content.length > 50
                    ? firstUserMessage.content.substring(0, 50) + '...'
                    : firstUserMessage.content;
                updateData = { ...updateData, title };
            }
        }

        await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData
        });

        res.json({
            userMessage,
            assistantMessage
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

router.delete('/conversations/:conversationId', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { conversationId } = req.params;

        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                userId: user.id
            }
        });

        if (!conversation) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }

        await prisma.message.deleteMany({
            where: { conversationId }
        });

        await prisma.conversation.delete({
            where: { id: conversationId }
        });

        res.json({ message: 'Conversation deleted successfully' });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

router.get('/conversations/:conversationId', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { conversationId } = req.params;

        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                userId: user.id
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!conversation) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }

        res.json({ conversation });
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Failed to get conversation' });
    }
});

router.delete('/conversations/cleanup', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const emptyConversations = await prisma.conversation.findMany({
            where: {
                userId: user.id,
                createdAt: { lt: oneHourAgo },
                messages: { none: {} }
            }
        });

        if (emptyConversations.length > 0) {
            await prisma.conversation.deleteMany({
                where: {
                    id: { in: emptyConversations.map(c => c.id) }
                }
            });
        }

        res.json({
            message: 'Empty conversations cleaned up',
            deletedCount: emptyConversations.length
        });
    } catch (error) {
        console.error('Cleanup conversations error:', error);
        res.status(500).json({ error: 'Failed to cleanup conversations' });
    }
});

export default router; 