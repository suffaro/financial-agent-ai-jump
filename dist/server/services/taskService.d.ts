export interface TaskParams {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
}
export declare class TaskService {
    createTask(userId: string, params: TaskParams): Promise<any>;
    getTasks(userId: string, status?: string): Promise<any[]>;
    getTaskById(userId: string, taskId: string): Promise<any>;
    updateTask(userId: string, taskId: string, updates: Partial<TaskParams & {
        status: string;
    }>): Promise<any>;
    deleteTask(userId: string, taskId: string): Promise<any>;
    completeTask(userId: string, taskId: string): Promise<any>;
    getPendingTasks(userId: string): Promise<any[]>;
    getOverdueTasks(userId: string): Promise<any[]>;
    getTaskStats(userId: string): Promise<any>;
}
//# sourceMappingURL=taskService.d.ts.map