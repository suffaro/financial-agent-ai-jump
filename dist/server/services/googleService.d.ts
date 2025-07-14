export declare class GoogleService {
    private getOAuth2Client;
    private getAuthenticatedClient;
    searchEmails(userId: string, query: string): Promise<any[]>;
    sendEmail(userId: string, params: {
        to: string;
        subject: string;
        body: string;
    }): Promise<any>;
    scheduleMeeting(userId: string, params: {
        contactName: string;
        subject: string;
        duration?: number;
        message?: string;
    }): Promise<any>;
    private findAvailableSlots;
    syncEmails(userId: string): Promise<void>;
    syncCalendar(userId: string): Promise<void>;
}
//# sourceMappingURL=googleService.d.ts.map