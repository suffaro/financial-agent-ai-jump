import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export class TaskService {
    async createTask(userId, params) {
        try {
            const task = await prisma.task.create({
                data: {
                    userId,
                    title: params.title,
                    description: params.description ?? null,
                    priority: params.priority ?? 'medium',
                    dueDate: params.dueDate ? new Date(params.dueDate) : null,
                    metadata: params.metadata ?? null,
                    parentTaskId: params.parentTaskId ?? null,
                    stepOrder: params.stepOrder ?? null
                }
            });
            return {
                success: true,
                task: {
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    status: task.status,
                    priority: task.priority,
                    dueDate: task.dueDate,
                    parentTaskId: task.parentTaskId,
                    stepOrder: task.stepOrder,
                    createdAt: task.createdAt
                }
            };
        }
        catch (error) {
            console.error('Create task error:', error);
            throw error;
        }
    }
    async getTasks(userId, status) {
        try {
            const where = { userId };
            if (status) {
                where.status = status;
            }
            const tasks = await prisma.task.findMany({
                where,
                orderBy: [
                    { priority: 'desc' },
                    { dueDate: 'asc' },
                    { createdAt: 'desc' }
                ]
            });
            return tasks;
        }
        catch (error) {
            console.error('Get tasks error:', error);
            throw error;
        }
    }
    async getTaskById(userId, taskId) {
        try {
            const task = await prisma.task.findFirst({
                where: {
                    id: taskId,
                    userId
                }
            });
            if (!task) {
                throw new Error('Task not found');
            }
            return task;
        }
        catch (error) {
            console.error('Get task error:', error);
            throw error;
        }
    }
    async updateTask(userId, taskId, updates) {
        try {
            const updateData = {};
            if (updates.title !== undefined)
                updateData.title = updates.title ?? null;
            if (updates.description !== undefined)
                updateData.description = updates.description ?? null;
            if (updates.status !== undefined)
                updateData.status = updates.status ?? null;
            if (updates.priority !== undefined)
                updateData.priority = updates.priority ?? 'medium';
            if (updates.dueDate !== undefined)
                updateData.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
            if (updates.completedAt !== undefined)
                updateData.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
            if (updates.metadata !== undefined)
                updateData.metadata = updates.metadata;
            if (updates.parentTaskId !== undefined)
                updateData.parentTaskId = updates.parentTaskId;
            if (updates.stepOrder !== undefined)
                updateData.stepOrder = updates.stepOrder;
            Object.keys(updateData).forEach(key => {
                if (updateData[key] === undefined) {
                    updateData[key] = null;
                }
            });
            const task = await prisma.task.update({
                where: {
                    id: taskId,
                    userId
                },
                data: updateData
            });
            return {
                success: true,
                task
            };
        }
        catch (error) {
            console.error('Update task error:', error);
            throw error;
        }
    }
    async deleteTask(userId, taskId) {
        try {
            await prisma.task.delete({
                where: {
                    id: taskId,
                    userId
                }
            });
            return {
                success: true,
                message: 'Task deleted successfully'
            };
        }
        catch (error) {
            console.error('Delete task error:', error);
            throw error;
        }
    }
    async completeTask(userId, taskId) {
        try {
            const task = await prisma.task.update({
                where: {
                    id: taskId,
                    userId
                },
                data: {
                    status: 'completed',
                    completedAt: new Date()
                }
            });
            return {
                success: true,
                task
            };
        }
        catch (error) {
            console.error('Complete task error:', error);
            throw error;
        }
    }
    async getPendingTasks(userId) {
        try {
            const tasks = await prisma.task.findMany({
                where: {
                    userId,
                    status: {
                        in: ['pending', 'in_progress', 'waiting_response']
                    }
                },
                orderBy: [
                    { priority: 'desc' },
                    { dueDate: 'asc' }
                ],
                include: {
                    parentTask: true,
                    subTasks: {
                        orderBy: { stepOrder: 'asc' }
                    }
                }
            });
            return tasks;
        }
        catch (error) {
            console.error('Get pending tasks error:', error);
            throw error;
        }
    }
    async getOverdueTasks(userId) {
        try {
            const tasks = await prisma.task.findMany({
                where: {
                    userId,
                    status: {
                        in: ['pending', 'in_progress', 'waiting_response']
                    },
                    dueDate: {
                        lt: new Date()
                    }
                },
                orderBy: [
                    { dueDate: 'asc' },
                    { priority: 'desc' }
                ],
                include: {
                    parentTask: true,
                    subTasks: {
                        orderBy: { stepOrder: 'asc' }
                    }
                }
            });
            return tasks;
        }
        catch (error) {
            console.error('Get overdue tasks error:', error);
            throw error;
        }
    }
    async getTaskStats(userId) {
        try {
            const [totalTasks, completedTasks, pendingTasks, overdueTasks] = await Promise.all([
                prisma.task.count({ where: { userId } }),
                prisma.task.count({
                    where: {
                        userId,
                        status: 'completed'
                    }
                }),
                prisma.task.count({
                    where: {
                        userId,
                        status: { in: ['pending', 'in_progress', 'waiting_response'] }
                    }
                }),
                prisma.task.count({
                    where: {
                        userId,
                        status: { in: ['pending', 'in_progress', 'waiting_response'] },
                        dueDate: { lt: new Date() }
                    }
                })
            ]);
            return {
                total: totalTasks,
                completed: completedTasks,
                pending: pendingTasks,
                overdue: overdueTasks,
                completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
            };
        }
        catch (error) {
            console.error('Get task stats error:', error);
            throw error;
        }
    }
    async createMultiStepTask(userId, params) {
        try {
            const parentTask = await this.createTask(userId, {
                title: params.title,
                description: params.description,
                priority: params.priority,
                metadata: { ...params.metadata, type: 'multi_step_parent', totalSteps: params.steps.length }
            });
            const subTasks = [];
            for (let i = 0; i < params.steps.length; i++) {
                const step = params.steps[i];
                const subTask = await this.createTask(userId, {
                    title: step.title,
                    description: step.description,
                    priority: params.priority,
                    parentTaskId: parentTask.task.id,
                    stepOrder: i + 1,
                    metadata: { ...step.metadata, type: 'multi_step_child' }
                });
                subTasks.push(subTask.task);
            }
            return {
                success: true,
                parentTask: parentTask.task,
                subTasks: subTasks
            };
        }
        catch (error) {
            console.error('Create multi-step task error:', error);
            throw error;
        }
    }
    async getTaskWithSteps(userId, taskId) {
        try {
            const task = await prisma.task.findFirst({
                where: {
                    id: taskId,
                    userId
                },
                include: {
                    subTasks: {
                        orderBy: { stepOrder: 'asc' }
                    },
                    parentTask: true
                }
            });
            if (!task) {
                throw new Error('Task not found');
            }
            return task;
        }
        catch (error) {
            console.error('Get task with steps error:', error);
            throw error;
        }
    }
    async advanceToNextStep(userId, taskId) {
        try {
            const task = await this.getTaskWithSteps(userId, taskId);
            if (!task.parentTaskId) {
                throw new Error('Task is not part of a multi-step workflow');
            }
            await this.updateTask(userId, taskId, {
                status: 'completed',
                completedAt: new Date().toISOString()
            });
            const parentTask = await this.getTaskWithSteps(userId, task.parentTaskId);
            const nextStep = parentTask.subTasks.find((step) => step.stepOrder === (task.stepOrder || 0) + 1 && step.status === 'pending');
            if (nextStep) {
                await this.updateTask(userId, nextStep.id, {
                    status: 'in_progress'
                });
                return {
                    success: true,
                    currentStep: nextStep,
                    message: `Advanced to step ${nextStep.stepOrder}: ${nextStep.title}`
                };
            }
            else {
                await this.updateTask(userId, task.parentTaskId, {
                    status: 'completed',
                    completedAt: new Date().toISOString()
                });
                return {
                    success: true,
                    message: 'All steps completed! Multi-step task is now complete.'
                };
            }
        }
        catch (error) {
            console.error('Advance to next step error:', error);
            throw error;
        }
    }
    async getWaitingTasks(userId) {
        try {
            const tasks = await prisma.task.findMany({
                where: {
                    userId,
                    status: 'waiting_response'
                },
                orderBy: [{ createdAt: 'desc' }],
                include: {
                    parentTask: true,
                    subTasks: {
                        orderBy: { stepOrder: 'asc' }
                    }
                }
            });
            return tasks;
        }
        catch (error) {
            console.error('Get waiting tasks error:', error);
            throw error;
        }
    }
    async resumeWaitingTask(userId, taskId, responseData) {
        try {
            const task = await this.getTaskWithSteps(userId, taskId);
            if (task.status !== 'waiting_response') {
                throw new Error('Task is not in waiting_response status');
            }
            const updatedMetadata = {
                ...task.metadata,
                responseReceived: true,
                responseData: responseData,
                responseTimestamp: new Date().toISOString()
            };
            await this.updateTask(userId, taskId, {
                status: 'in_progress',
                metadata: updatedMetadata
            });
            return {
                success: true,
                task: await this.getTaskWithSteps(userId, taskId),
                message: 'Task resumed successfully'
            };
        }
        catch (error) {
            console.error('Resume waiting task error:', error);
            throw error;
        }
    }
}
