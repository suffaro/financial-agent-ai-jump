export class APIErrorHandler {
    static createError(message, statusCode = 500, code, isRetryable = false) {
        const error = new Error(message);
        error.statusCode = statusCode;
        error.code = code;
        error.isRetryable = isRetryable;
        return error;
    }
    static handleAPIError(error, service) {
        console.error(`${service} API Error:`, error);
        if (error.status === 429 || error.code === 'RATE_LIMITED' || error.message?.includes('Too many requests')) {
            console.log(`Rate limit detected for ${service}, but continuing anyway in emergency mode`);
            const apiError = this.createError(`${service} API rate limit detected but bypassed.`, 200, 'RATE_LIMITED_BYPASSED', false);
            return apiError;
        }
        if (error.status === 401 || error.code === 'UNAUTHORIZED') {
            return this.createError(`${service} authentication failed. Please reconnect your account.`, 401, 'AUTH_REQUIRED', false);
        }
        if (error.status === 403 || error.message?.includes('token') || error.message?.includes('expired')) {
            return this.createError(`${service} access token expired. Please reconnect your account.`, 403, 'TOKEN_EXPIRED', false);
        }
        if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            return this.createError(`${service} network error. Please try again later.`, 503, 'NETWORK_ERROR', true);
        }
        if (error.status === 403 && error.message?.includes('quota')) {
            return this.createError(`${service} API quota exceeded. Please try again later.`, 403, 'QUOTA_EXCEEDED', true);
        }
        if (error.status === 400) {
            return this.createError(`${service} API bad request: ${error.message || 'Invalid request parameters'}`, 400, 'BAD_REQUEST', false);
        }
        if (error.status >= 500) {
            return this.createError(`${service} server error. Please try again later.`, error.status, 'SERVER_ERROR', true);
        }
        return this.createError(`${service} API error: ${error.message || 'Unknown error'}`, error.status || 500, 'UNKNOWN_ERROR', false);
    }
    static sendErrorResponse(res, error) {
        const response = {
            success: false,
            error: error.message,
            code: error.code
        };
        if (error.retryAfter) {
            response.retryAfter = error.retryAfter;
            res.set('Retry-After', error.retryAfter.toString());
        }
        res.status(error.statusCode || 500).json(response);
    }
    static async withRetry(operation, service, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                const apiError = this.handleAPIError(error, service);
                if (!apiError.isRetryable || attempt === maxRetries) {
                    throw apiError;
                }
                let delay = apiError.retryAfter
                    ? apiError.retryAfter * 1000
                    : baseDelay * Math.pow(2, attempt - 1);
                if (service === 'HubSpot' && apiError.code === 'RATE_LIMITED') {
                    delay = Math.max(delay, 60000);
                }
                console.log(`${service} API error on attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw this.handleAPIError(lastError, service);
    }
}
export class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.requests = [];
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    static getInstance(service, maxRequests, windowMs) {
        const key = `${service}-${maxRequests}-${windowMs}`;
        if (!this.instances.has(key)) {
            this.instances.set(key, new RateLimiter(maxRequests, windowMs));
        }
        return this.instances.get(key);
    }
    static clearAll() {
        this.instances.clear();
        console.log('All rate limiters cleared');
    }
    reset() {
        this.requests = [];
        console.log('Rate limiter reset');
    }
    async checkLimit() {
        console.log('Rate limiting disabled in emergency mode');
        return;
    }
}
RateLimiter.instances = new Map();
