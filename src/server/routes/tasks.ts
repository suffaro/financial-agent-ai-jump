import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { TaskService } from '../services/taskService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const taskService = new TaskService();

router.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { status } = req.query;

        const tasks = await taskService.getTasks(user.id, status as string);
        res.json({ tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

router.get('/stats/summary', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const stats = await taskService.getTaskStats(user.id);
        res.json(stats);
    } catch (error) {
        console.error('Get task stats error:', error);
        res.status(500).json({ error: 'Failed to get task stats' });
    }
});

router.get('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { id } = req.params;

        const task = await taskService.getTaskById(user.id, id);
        res.json({ task });
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({ error: 'Failed to get task' });
    }
});

// Task creation is only allowed through AI tool calls
// router.post('/tasks', ...) - REMOVED for security

// Task updates are only allowed through AI tool calls
// router.put('/tasks/:id', ...) - REMOVED for security

router.delete('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { id } = req.params;

        const result = await taskService.deleteTask(user.id, id);
        res.json(result);
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// Task completion is only allowed through AI tool calls
// router.post('/tasks/:id/complete', ...) - REMOVED for security

router.get('/tasks/pending', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        const tasks = await taskService.getPendingTasks(user.id);
        res.json({ tasks });
    } catch (error) {
        console.error('Get pending tasks error:', error);
        res.status(500).json({ error: 'Failed to get pending tasks' });
    }
});

router.get('/tasks/overdue', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        const tasks = await taskService.getOverdueTasks(user.id);
        res.json({ tasks });
    } catch (error) {
        console.error('Get overdue tasks error:', error);
        res.status(500).json({ error: 'Failed to get overdue tasks' });
    }
});

router.get('/tasks/stats', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        const stats = await taskService.getTaskStats(user.id);
        res.json({ stats });
    } catch (error) {
        console.error('Get task stats error:', error);
        res.status(500).json({ error: 'Failed to get task statistics' });
    }
});

// Multi-step task creation is only allowed through AI tool calls
// router.post('/tasks/multi-step', ...) - REMOVED for security

router.get('/tasks/:id/steps', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;
        const { id } = req.params;

        const task = await taskService.getTaskWithSteps(user.id, id);
        res.json({ task });
    } catch (error) {
        console.error('Get task with steps error:', error);
        res.status(500).json({ error: 'Failed to get task with steps' });
    }
});

// Task advancement is only allowed through AI tool calls
// router.post('/tasks/:id/advance', ...) - REMOVED for security

router.get('/tasks/waiting', authenticateToken, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).user!;

        const tasks = await taskService.getWaitingTasks(user.id);
        res.json({ tasks });
    } catch (error) {
        console.error('Get waiting tasks error:', error);
        res.status(500).json({ error: 'Failed to get waiting tasks' });
    }
});

// Task resumption is only allowed through AI tool calls
// router.post('/tasks/:id/resume', ...) - REMOVED for security

export default router; 