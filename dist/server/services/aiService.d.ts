export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: any[];
}
export interface AIResponse {
    content: string;
    toolCalls?: any[];
}
export interface RelevantDocument {
    content: string;
    metadata: {
        source: 'email' | 'hubspot_contact' | 'hubspot_note' | 'calendar';
        id: string;
        title?: string;
        date?: string;
    };
}
export declare class AIService {
    private openai;
    private googleService;
    private hubspotService;
    private taskService;
    constructor();
    searchRelevantDocuments(userId: string, query: string): Promise<RelevantDocument[]>;
    generateResponse(params: {
        userId: string;
        conversationId: string;
        userMessage: string;
        conversationHistory: ConversationMessage[];
        ongoingInstructions: string[];
        relevantDocuments: RelevantDocument[];
    }): Promise<AIResponse>;
    private buildSystemPrompt;
    private buildContextPrompt;
    private handleToolCalls;
    private getEmbedding;
    addDocumentToVectorStore(userId: string, content: string, metadata: any): Promise<void>;
}
//# sourceMappingURL=aiService.d.ts.map