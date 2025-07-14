import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export const errorHandler = (
    error: AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    // log error in development
    if (process.env['NODE_ENV'] === 'development') {
        console.error('Error:', {
            message: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
            body: req.body,
            params: req.params,
            query: req.query
        });
    }

    res.status(statusCode).json({
        error: message,
        ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack })
    });
};

export const createError = (message: string, statusCode: number = 500): AppError => {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
}; 