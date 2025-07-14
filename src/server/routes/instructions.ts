import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        const instructions = await prisma.ongoingInstruction.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ instructions });
    } catch (error) {
        console.error('Get instructions error:', error);
        res.status(500).json({ error: 'Failed to get instructions' });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { instruction } = req.body;

        if (!instruction || instruction.trim().length === 0) {
            return res.status(400).json({ error: 'Instruction text is required' });
        }

        const newInstruction = await prisma.ongoingInstruction.create({
            data: {
                userId: user.id,
                instruction: instruction.trim(),
                isActive: true
            }
        });

        res.json({
            success: true,
            instruction: newInstruction,
            message: 'Ongoing instruction added successfully'
        });
    } catch (error) {
        console.error('Add instruction error:', error);
        res.status(500).json({ error: 'Failed to add instruction' });
    }
});

router.patch('/:instructionId', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { instructionId } = req.params;
        const { isActive, instruction } = req.body;

        const updatedInstruction = await prisma.ongoingInstruction.update({
            where: {
                id: instructionId,
                userId: user.id
            },
            data: {
                ...(typeof isActive === 'boolean' && { isActive }),
                ...(instruction && { instruction: instruction.trim() })
            }
        });

        res.json({
            success: true,
            instruction: updatedInstruction,
            message: 'Instruction updated successfully'
        });
    } catch (error) {
        console.error('Update instruction error:', error);
        res.status(500).json({ error: 'Failed to update instruction' });
    }
});

router.delete('/:instructionId', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { instructionId } = req.params;

        await prisma.ongoingInstruction.delete({
            where: {
                id: instructionId,
                userId: user.id
            }
        });

        res.json({
            success: true,
            message: 'Instruction deleted successfully'
        });
    } catch (error) {
        console.error('Delete instruction error:', error);
        res.status(500).json({ error: 'Failed to delete instruction' });
    }
});

export default router;