export declare class HubspotService {
    private getClient;
    searchContacts(userId: string, query: string): Promise<any[]>;
    createContact(userId: string, params: {
        email: string;
        firstName?: string;
        lastName?: string;
        company?: string;
    }): Promise<any>;
    addNote(userId: string, params: {
        contactEmail: string;
        note: string;
    }): Promise<any>;
    syncContacts(userId: string): Promise<void>;
    syncNotes(userId: string): Promise<void>;
    getContactById(userId: string, contactId: string): Promise<any>;
    updateContact(userId: string, contactId: string, properties: any): Promise<any>;
}
//# sourceMappingURL=hubspotService.d.ts.map