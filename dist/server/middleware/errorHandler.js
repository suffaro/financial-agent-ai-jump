export const errorHandler = (error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
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
export const createError = (message, statusCode = 500) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
};
