export declare function initializeWebhooks(): Promise<void>;
export declare function setupGmailWebhook(accessToken: string): Promise<import("googleapis").gmail_v1.Schema$WatchResponse>;
export declare function setupCalendarWebhook(accessToken: string): Promise<import("googleapis").calendar_v3.Schema$Channel>;
export declare function setupHubspotWebhook(accessToken: string): Promise<unknown>;
export declare function processWebhookEvent(eventId: string): Promise<void>;
//# sourceMappingURL=webhooks.d.ts.map