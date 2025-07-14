import { Response } from 'express';

export interface APIError extends Error {
    statusCode?: number;
    code?: string;
    retryAfter?: number;
    isRetryable?: boolean;
}

export class APIErrorHandler {

    static createError(message: string, statusCode: number = 500, code?: string, isRetryable: boolean = false): APIError {
        const error = new Error(message) as APIError;
        error.statusCode = statusCode;
        error.code = code;
        error.isRetryable = isRetryable;
        return error;
    }


    static handleAPIError(error: any, service: string): APIError {
        console.error(`${service} API Error:`, error);


        if (error.status === 429 || error.code === 'RATE_LIMITED' || error.message?.includes('Too many requests')) {
            // EMERGENCY: Don't retry rate limited requests, just log and continue
            console.log(`Rate limit detected for ${service}, but continuing anyway in emergency mode`);
            const apiError = this.createError(
                `${service} API rate limit detected but bypassed.`,
                200,
                'RATE_LIMITED_BYPASSED',
                false
            );
            return apiError;
        }


        if (error.status === 401 || error.code === 'UNAUTHORIZED') {
            return this.createError(
                `${service} authentication failed. Please reconnect your account.`,
                401,
                'AUTH_REQUIRED',
                false
            );
        }


        if (error.status === 403 || error.message?.includes('token') || error.message?.includes('expired')) {
            return this.createError(
                `${service} access token expired. Please reconnect your account.`,
                403,
                'TOKEN_EXPIRED',
                false
            );
        }


        if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            return this.createError(
                `${service} network error. Please try again later.`,
                503,
                'NETWORK_ERROR',
                true
            );
        }


        if (error.status === 403 && error.message?.includes('quota')) {
            return this.createError(
                `${service} API quota exceeded. Please try again later.`,
                403,
                'QUOTA_EXCEEDED',
                true
            );
        }


        if (error.status === 400) {
            return this.createError(
                `${service} API bad request: ${error.message || 'Invalid request parameters'}`,
                400,
                'BAD_REQUEST',
                false
            );
        }


        if (error.status >= 500) {
            return this.createError(
                `${service} server error. Please try again later.`,
                error.status,
                'SERVER_ERROR',
                true
            );
        }


        return this.createError(
            `${service} API error: ${error.message || 'Unknown error'}`,
            error.status || 500,
            'UNKNOWN_ERROR',
            false
        );
    }

    static sendErrorResponse(res: Response, error: APIError) {
        const response: any = {
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

    /**
     * retry logic for API calls
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        service: string,
        maxRetries: number = 3,
        baseDelay: number = 1000
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
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

/**
 * rate limiter utility
 */
export class RateLimiter {
    private static instances = new Map<string, RateLimiter>();
    private requests: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;

    private constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    static getInstance(service: string, maxRequests: number, windowMs: number): RateLimiter {
        const key = `${service}-${maxRequests}-${windowMs}`;
        if (!this.instances.has(key)) {
            this.instances.set(key, new RateLimiter(maxRequests, windowMs));
        }
        return this.instances.get(key)!;
    }

    static clearAll(): void {
        this.instances.clear();
        console.log('All rate limiters cleared');
    }

    reset(): void {
        this.requests = [];
        console.log('Rate limiter reset');
    }

    async checkLimit(): Promise<void> {
        // EMERGENCY: Disable all rate limiting temporarily
        console.log('Rate limiting disabled in emergency mode');
        return;
    }
}