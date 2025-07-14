import { PrismaClient } from '@prisma/client';
import { GoogleService } from './googleService.js';
import { HubspotService } from './hubspotService.js';
import { TaskService } from './taskService.js';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';
import axios from 'axios';
const prisma = new PrismaClient();
const googleService = new GoogleService();
const hubspotService = new HubspotService();
const taskService = new TaskService();
const GROQ_API_KEY = process.env['GROQ_API_KEY'] || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const embeddings = new HuggingFaceInferenceEmbeddings({
    apiKey: process.env['HUGGINGFACE_API_KEY'] || '',
    model: 'sentence-transformers/all-MiniLM-L6-v2'
});
export class AIService {
    async processMessage(userId, conversationId, content, context = 'all') {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    ongoingInstructions: {
                        where: { isActive: true }
                    }
                }
            });
            if (!user) {
                throw new Error('User not found');
            }
            const conversationHistory = await prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'asc' },
                take: 20
            });
            let recentEmails = [];
            let recentCalendarEvents = [];
            let recentContacts = [];
            let recentTasks = [];
            if (context === 'all' || context === 'emails') {
                const allEmails = await prisma.emailMessage.findMany({
                    where: { userId },
                    orderBy: { receivedAt: 'desc' },
                    take: context === 'emails' ? 30 : 10
                });
                const spamPatterns = [
                    /@promo\.|@marketing\.|@newsletter\.|noreply@|no-reply@|donotreply@/i,
                    /promo@|marketing@|deals@|offers@|newsletter@|update@|notification@/i
                ];
                recentEmails = allEmails.filter(email => {
                    const fromLower = email.from.toLowerCase();
                    return !spamPatterns.some(pattern => pattern.test(fromLower));
                }).slice(0, context === 'emails' ? 20 : 5);
            }
            if (context === 'all' || context === 'calendar') {
                recentCalendarEvents = await prisma.calendarEvent.findMany({
                    where: {
                        userId,
                        startTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                    },
                    orderBy: { startTime: 'asc' },
                    take: context === 'calendar' ? 20 : 5
                });
            }
            if (context === 'all' || context === 'contacts') {
                recentContacts = await prisma.hubspotContact.findMany({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                    take: context === 'contacts' ? 20 : 5
                });
            }
            if (context === 'all') {
                recentTasks = await prisma.task.findMany({
                    where: {
                        userId,
                        status: { in: ['pending', 'in_progress', 'waiting_response'] }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5
                });
            }
            let relevantDocs = [];
            if (content.length > 10) {
                try {
                    relevantDocs = await this.searchVectorStore(userId, content, 3, context);
                }
                catch (error) {
                    console.error('Error in initial RAG search:', error);
                }
            }
            const contextString = this.buildContext(user, recentEmails, recentCalendarEvents, recentContacts, recentTasks, relevantDocs);
            const messages = [
                {
                    role: 'system',
                    content: `You are an AI financial advisor assistant for ${user.name || user.email}.

                    Your primary directive is to understand the user's intent and provide helpful responses using the available tools and data.

                    CRITICAL CONTEXT RULES:
                    - Pay close attention to the conversation history above. When users refer to "the meeting above", "that email", "this contact", etc., they are referring to information from earlier in this conversation.
                    - When users ask to delete, modify, or reference something mentioned earlier, look through the conversation history first before using search tools.
                    - Always maintain context between messages in the same conversation.

                    CORE RULES:
                    1. SIMPLE INTERACTIONS: For greetings ("hi", "hello"), thanks, or casual conversation, respond directly without using tools.
                    
                    2. INFORMATION REQUESTS: When users ask questions about emails, contacts, meetings, or want to find information:
                       - FIRST check the conversation history for any relevant context
                       - For contact queries: Use list_all_contacts when asked "What contacts do I have?" or similar general requests. Use search_contacts for specific searches.
                       - THEN use the appropriate search tool (search_emails, search_contacts, search_calendar, list_all_contacts)
                       - Use RAG search to find relevant information from past conversations and notes
                       - Provide specific, detailed answers based on the actual data found
                       - If no data is found, clearly state that and suggest alternatives
                    
                    3. ACTION REQUESTS: When users want to:
                       - Send emails: Use send_email or send_email_to_contact tools
                       - Schedule meetings: Use schedule_appointment (for scheduling with contacts) or create_calendar_event (for direct calendar events)
                       - Create tasks: Use create_task
                       - Add ongoing instructions: Use add_ongoing_instruction
                       - DELETE/MODIFY something: First check conversation history for context, then use appropriate tools
                    
                    4. MEETING CREATION: Before creating any meeting/calendar event:
                       - Ensure you have: clear title/subject, attendees (unless it's a personal reminder), and specific time
                       - If missing information, ask the user to provide it rather than making assumptions
                       - Don't create vague meetings without context
                    
                    5. EMAIL FILTERING: When searching emails, prioritize real business/personal correspondence over promotional emails unless specifically asked for promotional content.
                    
                    6. CONTEXT REFERENCES: When users say "the meeting above", "that contact", "this email", etc.:
                       - Look at the conversation history first
                       - Extract the specific details mentioned earlier (times, names, subjects)
                       - Use those details in your search queries or actions

                    BACKGROUND CONTEXT:
                    ${contextString}

                    Remember: Your responses should be helpful, accurate, and based on actual data from the tools. Always consider the conversation history when users make references to previous information.`
                }
            ];
            conversationHistory.forEach(msg => {
                const messageObj = {
                    role: msg.role,
                    content: msg.content
                };
                if (msg.role === 'assistant' && msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
                    messageObj.tool_calls = JSON.parse(JSON.stringify(msg.toolCalls));
                }
                messages.push(messageObj);
            });
            const lastMessage = conversationHistory[conversationHistory.length - 1];
            if (!lastMessage || lastMessage.content !== content || lastMessage.role !== 'user') {
                messages.push({
                    role: 'user',
                    content
                });
            }
            const tools = [
                {
                    type: "function",
                    function: {
                        name: "search_emails",
                        description: "Search through emails for specific content or sender",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "Search query for emails" }
                            },
                            required: ["query"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "search_contacts",
                        description: "Search HubSpot contacts by name, email, or other criteria",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "Search query for contacts" }
                            },
                            required: ["query"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "list_all_contacts",
                        description: "List all HubSpot contacts with optional limit",
                        parameters: {
                            type: "object",
                            properties: {
                                limit: { type: "number", description: "Maximum number of contacts to return (default: 50)" }
                            }
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "schedule_appointment",
                        description: "Schedule an appointment with a contact. Can parse natural language times like '5 AM Jul 13' or 'tomorrow at 2 PM'",
                        parameters: {
                            type: "object",
                            properties: {
                                contactName: { type: "string", description: "Name of the contact" },
                                duration: { type: "number", description: "Duration in minutes", default: 30 },
                                description: { type: "string", description: "Meeting description" },
                                specificTime: { type: "string", description: "Specific time for the meeting (e.g., '5 AM Jul 13', 'tomorrow at 2 PM')" }
                            },
                            required: ["contactName"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "send_email",
                        description: "Send an email to a contact",
                        parameters: {
                            type: "object",
                            properties: {
                                to: { type: "string", description: "Recipient email address" },
                                subject: { type: "string", description: "Email subject" },
                                body: { type: "string", description: "Email body content" }
                            },
                            required: ["to", "subject", "body"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "create_task",
                        description: "Create a task to be completed later",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "Task title" },
                                description: { type: "string", description: "Task description" },
                                priority: { type: "string", enum: ["low", "medium", "high"], default: "medium" }
                            },
                            required: ["title"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "add_ongoing_instruction",
                        description: "Add an ongoing instruction that should be remembered and acted upon for future events",
                        parameters: {
                            type: "object",
                            properties: {
                                instruction: { type: "string", description: "The ongoing instruction to remember" }
                            },
                            required: ["instruction"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "send_email_to_contact",
                        description: "Send an email to a specific contact",
                        parameters: {
                            type: "object",
                            properties: {
                                contactName: { type: "string", description: "Name of the contact to email" },
                                subject: { type: "string", description: "Email subject" },
                                body: { type: "string", description: "Email body content" }
                            },
                            required: ["contactName", "subject", "body"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "create_hubspot_contact",
                        description: "Create a new contact in HubSpot",
                        parameters: {
                            type: "object",
                            properties: {
                                email: { type: "string", description: "Contact email address" },
                                firstName: { type: "string", description: "Contact first name" },
                                lastName: { type: "string", description: "Contact last name" },
                                company: { type: "string", description: "Contact company" },
                                note: { type: "string", description: "Initial note about the contact" }
                            },
                            required: ["email"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "search_calendar",
                        description: "Search calendar events by date range, attendees, or content",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "Search query for calendar events" },
                                startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
                                endDate: { type: "string", description: "End date (YYYY-MM-DD)" }
                            },
                            required: ["query"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "create_calendar_event",
                        description: "Create a new calendar event. IMPORTANT: Always ask the user for missing details before creating. Do not create meetings without proper context.",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "Event title/subject - REQUIRED" },
                                description: { type: "string", description: "Event description/agenda" },
                                startTime: { type: "string", description: "Start time (ISO string) - REQUIRED" },
                                endTime: { type: "string", description: "End time (ISO string) - REQUIRED" },
                                attendees: { type: "array", items: { type: "string" }, description: "Array of attendee emails - at least one attendee should be specified" },
                                location: { type: "string", description: "Event location (optional)" }
                            },
                            required: ["title", "startTime", "endTime"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "delete_calendar_events",
                        description: "Delete calendar events matching criteria",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "Search query to find events to delete (e.g., 'all', 'today', 'with Jacob')" },
                                startDate: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
                                endDate: { type: "string", description: "End date filter (YYYY-MM-DD)" }
                            },
                            required: ["query"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "process_appointment_response",
                        description: "Process a response to an appointment request and advance the scheduling workflow",
                        parameters: {
                            type: "object",
                            properties: {
                                contactName: { type: "string", description: "Name of the contact who responded" },
                                responseType: { type: "string", enum: ["accepted", "declined", "alternative_time", "unclear"], description: "Type of response received" },
                                selectedTime: { type: "string", description: "Time slot accepted by contact (if accepted)" },
                                alternativeTime: { type: "string", description: "Alternative time suggested by contact" },
                                responseText: { type: "string", description: "Full text of the response for context" }
                            },
                            required: ["contactName", "responseType"]
                        }
                    }
                }
            ];
            const groqResponse = await axios.post(GROQ_API_URL, {
                model: 'llama-3.1-8b-instant',
                messages,
                tools: tools,
                tool_choice: "auto",
                max_tokens: 1000,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            const aiMessage = groqResponse.data.choices[0]?.message;
            const aiResponse = aiMessage?.content || 'I apologize, but I was unable to generate a response.';
            const toolCalls = aiMessage?.tool_calls || [];
            let finalResponse = aiResponse;
            if (toolCalls.length > 0) {
                const toolResults = await this.executeToolCalls(userId, toolCalls);
                const successfulTools = toolResults.filter(r => r.result && !r.error);
                const failedTools = toolResults.filter(r => r.error);
                const toolResponses = successfulTools
                    .map(r => r.result?.formattedResponse || r.result?.message || JSON.stringify(r.result))
                    .filter(response => response && response.length > 0);
                if (toolResponses.length > 0) {
                    finalResponse = toolResponses.join('\n\n');
                }
                else {
                    const followUpMessages = [
                        ...messages,
                        { role: 'assistant', content: aiResponse, tool_calls: toolCalls },
                        ...toolResults.map(result => ({
                            role: 'tool',
                            content: result.result?.formattedResponse || JSON.stringify(result.result),
                            tool_call_id: result.toolCallId
                        }))
                    ];
                    try {
                        const followUpResponse = await axios.post(GROQ_API_URL, {
                            model: 'llama-3.1-8b-instant',
                            messages: followUpMessages,
                            max_tokens: 1000,
                            temperature: 0.7
                        }, {
                            headers: {
                                'Authorization': `Bearer ${GROQ_API_KEY}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        const followUpAIMessage = followUpResponse.data.choices[0]?.message;
                        if (followUpAIMessage?.content) {
                            finalResponse = followUpAIMessage.content;
                        }
                    }
                    catch (followUpError) {
                        console.error('Error in follow-up response:', followUpError);
                        let toolSummary = '';
                        if (successfulTools.length > 0) {
                            toolSummary += `Completed: ${successfulTools.map(r => r.function).join(', ')}`;
                        }
                        if (failedTools.length > 0) {
                            if (toolSummary)
                                toolSummary += '. ';
                            toolSummary += `Failed: ${failedTools.map(r => r.function).join(', ')}`;
                        }
                        finalResponse = aiResponse ? `${aiResponse}\n\n${toolSummary}` : `I've ${toolSummary.toLowerCase()}.`;
                    }
                }
            }
            return {
                content: finalResponse,
                toolCalls: toolCalls
            };
        }
        catch (error) {
            console.error('AI processing error:', error);
            if (error.response) {
                console.error('Groq API Error Response:', {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data,
                    headers: error.response.headers
                });
            }
            return {
                content: 'I apologize, but I encountered an error while processing your request. Please try again.',
                toolCalls: []
            };
        }
    }
    buildContext(user, emails, calendarEvents, contacts, tasks, relevantDocs = []) {
        let context = `User: ${user.name || user.email}\n\n`;
        if (user.ongoingInstructions.length > 0) {
            context += 'Ongoing Instructions:\n';
            user.ongoingInstructions.forEach((instruction) => {
                context += `- ${instruction.instruction}\n`;
            });
            context += '\n';
        }
        if (emails.length > 0) {
            context += 'Recent Emails:\n';
            emails.forEach(email => {
                context += `- ${email.subject} (${email.from})\n`;
            });
            context += '\n';
        }
        if (calendarEvents.length > 0) {
            context += 'Upcoming Calendar Events:\n';
            calendarEvents.forEach(event => {
                context += `- ${event.title} (${event.startTime})\n`;
            });
            context += '\n';
        }
        if (contacts.length > 0) {
            context += 'Recent HubSpot Contacts:\n';
            contacts.forEach(contact => {
                context += `- ${contact.firstName} ${contact.lastName} (${contact.email})\n`;
            });
            context += '\n';
        }
        if (tasks.length > 0) {
            context += 'Recent Tasks:\n';
            tasks.forEach(task => {
                context += `- ${task.title} (${task.status})\n`;
            });
            context += '\n';
        }
        if (relevantDocs.length > 0) {
            context += 'Relevant Information from Past Data:\n';
            relevantDocs.forEach((doc, index) => {
                const source = doc.metadata.source === 'email' ? 'Email' :
                    doc.metadata.source === 'hubspot_note' ? 'HubSpot Note' :
                        doc.metadata.source === 'hubspot_contact' ? 'Contact Info' : 'Calendar';
                const title = doc.metadata.title || '';
                const date = doc.metadata.date ? ` (${new Date(doc.metadata.date).toLocaleDateString()})` : '';
                context += `${index + 1}. [${source}${date}] ${title}\n`;
                context += `   ${doc.content.substring(0, 200)}${doc.content.length > 200 ? '...' : ''}\n\n`;
            });
        }
        return context;
    }
    async generateEmbedding(text) {
        try {
            const cleanText = text
                .replace(/<[^>]*>/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 500);
            if (!cleanText) {
                return Array(384).fill(0);
            }
            const embedding = await embeddings.embedQuery(cleanText);
            if (Array.isArray(embedding) && embedding.length === 384) {
                return embedding;
            }
            console.warn('Received unexpected embedding format from LangChain:', embedding);
            return Array(384).fill(0);
        }
        catch (error) {
            console.error('Error generating embedding with LangChain:', error);
            return Array(384).fill(0);
        }
    }
    async addDocumentToVectorStore(userId, content, metadata) {
        try {
            const embedding = await this.generateEmbedding(content);
            const metadataJson = JSON.stringify(metadata);
            const embeddingVector = `[${embedding.join(',')}]`;
            await prisma.$executeRaw `
                INSERT INTO vector_documents (id, "userId", content, metadata, embedding, "createdAt")
                VALUES (gen_random_uuid(), ${userId}, ${content}, ${metadataJson}::jsonb, ${embeddingVector}::vector, NOW())
            `;
        }
        catch (error) {
            console.error('Error adding document to vector store:', error);
        }
    }
    async searchVectorStore(userId, query, limit = 5, contextFilter = 'all') {
        try {
            if (query.trim().length < 3) {
                return [];
            }
            const queryEmbedding = await this.generateEmbedding(query);
            const queryVector = `[${queryEmbedding.join(',')}]`;
            const documents = await prisma.$queryRaw `
                SELECT id, content, metadata, 
                       (1 - (embedding <=> ${queryVector}::vector)) as similarity
                FROM vector_documents 
                WHERE "userId" = ${userId}
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> ${queryVector}::vector
                LIMIT ${limit}
            `;
            let filteredDocuments = documents;
            if (contextFilter === 'emails') {
                filteredDocuments = documents.filter(doc => doc.metadata?.source === 'email');
            }
            else if (contextFilter === 'calendar') {
                filteredDocuments = documents.filter(doc => doc.metadata?.source === 'calendar');
            }
            else if (contextFilter === 'contacts') {
                filteredDocuments = documents.filter(doc => doc.metadata?.source === 'hubspot_contact' || doc.metadata?.source === 'hubspot_note');
            }
            return filteredDocuments.map(doc => ({
                content: doc.content,
                metadata: doc.metadata
            }));
        }
        catch (error) {
            console.error('Error searching vector store:', error);
            try {
                const documents = await prisma.vectorDocument.findMany({
                    where: {
                        userId,
                        OR: [
                            { content: { contains: query, mode: 'insensitive' } },
                            { content: { contains: query.split(' ')[0], mode: 'insensitive' } }
                        ]
                    },
                    orderBy: { createdAt: 'desc' },
                    take: limit
                });
                let filteredDocuments = documents;
                if (contextFilter === 'emails') {
                    filteredDocuments = documents.filter(doc => doc.metadata?.source === 'email');
                }
                else if (contextFilter === 'calendar') {
                    filteredDocuments = documents.filter(doc => doc.metadata?.source === 'calendar');
                }
                else if (contextFilter === 'contacts') {
                    filteredDocuments = documents.filter(doc => doc.metadata?.source === 'hubspot_contact' || doc.metadata?.source === 'hubspot_note');
                }
                return filteredDocuments.map(doc => ({
                    content: doc.content,
                    metadata: doc.metadata
                }));
            }
            catch (fallbackError) {
                console.error('Error in fallback text search:', fallbackError);
                return [];
            }
        }
    }
    async executeToolCalls(userId, toolCalls) {
        const results = [];
        for (const toolCall of toolCalls) {
            try {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                let result;
                console.log(`Executing tool: ${functionName} with args:`, args);
                switch (functionName) {
                    case 'search_emails':
                        result = await this.handleSearchEmails(userId, args);
                        break;
                    case 'search_contacts':
                        result = await this.handleSearchContacts(userId, args);
                        break;
                    case 'list_all_contacts':
                        result = await this.handleListAllContacts(userId, args);
                        break;
                    case 'schedule_appointment':
                        result = await this.handleScheduleAppointment(userId, args);
                        break;
                    case 'send_email':
                        result = await this.handleSendEmail(userId, args);
                        break;
                    case 'create_task':
                        result = await this.handleCreateTask(userId, args);
                        break;
                    case 'add_ongoing_instruction':
                        result = await this.handleAddOngoingInstruction(userId, args);
                        break;
                    case 'send_email_to_contact':
                        result = await this.handleSendEmailToContact(userId, args);
                        break;
                    case 'create_hubspot_contact':
                        result = await this.handleCreateHubspotContact(userId, args);
                        break;
                    case 'search_calendar':
                        result = await this.handleSearchCalendar(userId, args);
                        break;
                    case 'create_calendar_event':
                        result = await this.handleCreateCalendarEvent(userId, args);
                        break;
                    case 'delete_calendar_events':
                        result = await this.handleDeleteCalendarEvents(userId, args);
                        break;
                    case 'process_appointment_response':
                        result = await this.handleProcessAppointmentResponse(userId, args);
                        break;
                    default:
                        console.warn(`Unknown tool function: ${functionName}`);
                        result = { error: `Unknown function: ${functionName}` };
                }
                console.log(`Tool ${functionName} result:`, result);
                results.push({
                    function: functionName,
                    args,
                    result,
                    toolCallId: toolCall.id
                });
            }
            catch (error) {
                console.error(`Error executing tool call ${toolCall.function.name}:`, error);
                results.push({
                    function: toolCall.function.name,
                    args: toolCall.function.arguments,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    toolCallId: toolCall.id
                });
            }
        }
        return results;
    }
    async handleSearchEmails(userId, args) {
        const query = args.query.toLowerCase();
        let emails = [];
        let dateFilter = null;
        if (query.includes('yesterday')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const endOfYesterday = new Date(yesterday);
            endOfYesterday.setHours(23, 59, 59, 999);
            dateFilter = { gte: yesterday, lte: endOfYesterday };
        }
        else if (query.includes('today')) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            dateFilter = { gte: today };
        }
        else {
            const timeMatch = query.match(/(?:last|past|during|this)\s+(\d+)?\s*(day|week|month|year)s?|(\d+)\s*(day|week|month|year)s?\s+ago/);
            if (timeMatch) {
                const number = parseInt(timeMatch[1] || timeMatch[3] || '1');
                const unit = timeMatch[2] || timeMatch[4];
                const date = new Date();
                switch (unit) {
                    case 'day':
                        date.setDate(date.getDate() - number);
                        break;
                    case 'week':
                        date.setDate(date.getDate() - (number * 7));
                        break;
                    case 'month':
                        date.setMonth(date.getMonth() - number);
                        break;
                    case 'year':
                        date.setFullYear(date.getFullYear() - number);
                        break;
                }
                dateFilter = { gte: date };
            }
        }
        const spamPatterns = [
            /@promo\.|@marketing\.|@newsletter\.|noreply@|no-reply@|donotreply@/i,
            /promo@|marketing@|deals@|offers@|newsletter@|update@|notification@/i,
            /support@.*\.(com|org|net)$/i,
            /@.*\.epicentrk\.|@.*glassdoor|@.*rozetka|@.*krkr\.|@.*github\.com|@.*interactivebrokers/i
        ];
        const spamKeywords = [
            'promo', 'deal', 'offer', 'sale', 'discount', 'newsletter', 'unsubscribe',
            'marketing', 'advertisement', 'notification', 'update', 'alert', 'reminder',
            'noreply', 'no-reply', 'donotreply', 'automated'
        ];
        let searchNames = [];
        const personPatterns = [
            /(?:what|who)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)*)\s+(?:wrote|emailed|sent)/i,
            /(?:from|by)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)*)/i,
            /([a-zA-Z]+(?:\s+[a-zA-Z]+)*)\s+(?:wrote|emailed|sent)/i,
            /([a-zA-Z]+@[a-zA-Z0-9.-]+)/i,
            /\b([a-zA-Z]{4,})\b/g
        ];
        for (const pattern of personPatterns) {
            const matches = query.match(pattern);
            if (matches) {
                const extractedName = matches[1]?.trim();
                if (extractedName &&
                    !['what', 'who', 'from', 'wrote', 'emailed', 'sent', 'today', 'yesterday', 'week', 'month', 'year', 'this', 'last', 'past'].includes(extractedName.toLowerCase())) {
                    searchNames.push(extractedName);
                }
            }
        }
        searchNames = [...new Set(searchNames)].filter(name => name.length >= 3);
        const searchCriteria = { userId };
        if (dateFilter) {
            searchCriteria.receivedAt = dateFilter;
        }
        if (searchNames.length > 0) {
            searchCriteria.OR = searchNames.map(name => ({
                from: { contains: name, mode: 'insensitive' }
            }));
        }
        else if (!dateFilter) {
            searchCriteria.OR = [
                { subject: { contains: args.query, mode: 'insensitive' } },
                { body: { contains: args.query, mode: 'insensitive' } },
                { from: { contains: args.query, mode: 'insensitive' } }
            ];
        }
        if (searchNames.length === 0 && dateFilter && args.query !== query) {
            const remainingQuery = args.query.replace(/yesterday|today|this\s+week|last\s+week|this\s+month|last\s+month/gi, '').trim();
            if (remainingQuery.length > 2) {
                searchCriteria.OR = [
                    { subject: { contains: remainingQuery, mode: 'insensitive' } },
                    { body: { contains: remainingQuery, mode: 'insensitive' } },
                    { from: { contains: remainingQuery, mode: 'insensitive' } }
                ];
            }
        }
        const allEmails = await prisma.emailMessage.findMany({
            where: searchCriteria,
            take: 50,
            orderBy: { receivedAt: 'desc' }
        });
        const isLookingForPromotional = query.includes('promotional') || query.includes('promo') || query.includes('marketing') || query.includes('newsletter');
        if (!isLookingForPromotional) {
            emails = allEmails.filter(email => {
                const fromLower = email.from.toLowerCase();
                const subjectLower = (email.subject || '').toLowerCase();
                const isSpamPattern = spamPatterns.some(pattern => pattern.test(fromLower));
                const hasSpamKeywords = spamKeywords.some(keyword => fromLower.includes(keyword) || subjectLower.includes(keyword));
                return !isSpamPattern && !hasSpamKeywords;
            }).slice(0, 20);
        }
        else {
            emails = allEmails.slice(0, 20);
        }
        const vectorResults = await this.searchVectorStore(userId, args.query, 8, 'emails');
        const emailVectorResults = vectorResults.filter(doc => doc.metadata.source === 'email');
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true }
        });
        const userEmail = user?.email?.toLowerCase() || '';
        const formattedEmails = emails.map((email, index) => {
            const date = new Date(email.receivedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const snippet = email.body?.substring(0, 150)?.replace(/\s+/g, ' ')?.trim() || '';
            const isSentEmail = email.from.toLowerCase().includes(userEmail);
            const direction = isSentEmail ? 'Sent to' : 'From';
            const contact = isSentEmail ? email.to[0] || 'Unknown' : email.from;
            return `${index + 1}. **${email.subject}**
   ${direction}: ${contact}
   Date: ${date}
   Preview: ${snippet}${snippet.length > 0 ? '...' : ''}`;
        }).join('\n\n');
        const totalFiltered = isLookingForPromotional ? 0 : (allEmails.length - emails.length);
        const filterNote = totalFiltered > 0 ? ` (filtered out ${totalFiltered} promotional emails)` : '';
        return {
            count: emails.length,
            formattedResponse: emails.length > 0
                ? `Found ${emails.length} email${emails.length > 1 ? 's' : ''}${filterNote}:\n\n${formattedEmails}`
                : isLookingForPromotional
                    ? "No promotional emails found matching your criteria."
                    : "No personal/business emails found matching your criteria. Use 'promotional emails' if you want to see filtered messages.",
            emails: emails.map((email) => {
                const isSentEmail = email.from.toLowerCase().includes(userEmail);
                return {
                    subject: email.subject,
                    from: email.from,
                    to: email.to,
                    receivedAt: email.receivedAt,
                    snippet: email.body?.substring(0, 200) + '...',
                    direction: isSentEmail ? 'sent' : 'received',
                    isSentEmail: isSentEmail
                };
            }),
            vectorMatches: emailVectorResults.length > 0 ? emailVectorResults.map(doc => ({
                content: doc.content.substring(0, 200) + '...',
                source: doc.metadata.title || 'Email',
                from: doc.metadata.from
            })) : undefined
        };
    }
    async handleSearchContacts(userId, args) {
        const searchTerms = args.query.toLowerCase().split(' ').filter(term => term.length > 1);
        const contacts = await prisma.hubspotContact.findMany({
            where: {
                userId,
                OR: [
                    { firstName: { contains: args.query, mode: 'insensitive' } },
                    { lastName: { contains: args.query, mode: 'insensitive' } },
                    { email: { contains: args.query, mode: 'insensitive' } },
                    { company: { contains: args.query, mode: 'insensitive' } },
                    { phone: { contains: args.query, mode: 'insensitive' } },
                    ...searchTerms.map(term => ({ firstName: { contains: term, mode: 'insensitive' } })),
                    ...searchTerms.map(term => ({ lastName: { contains: term, mode: 'insensitive' } }))
                ]
            },
            take: 15,
            orderBy: { createdAt: 'desc' }
        });
        const emailContacts = await prisma.emailMessage.findMany({
            where: {
                userId,
                OR: [
                    { from: { contains: args.query, mode: 'insensitive' } },
                    { body: { contains: args.query, mode: 'insensitive' } },
                    { subject: { contains: args.query, mode: 'insensitive' } }
                ]
            },
            take: 10,
            orderBy: { receivedAt: 'desc' },
            select: {
                from: true,
                subject: true,
                receivedAt: true,
                body: true
            }
        });
        const hubspotEmails = new Set(contacts.map(c => c.email?.toLowerCase()).filter(Boolean));
        const uniqueEmailContacts = emailContacts.reduce((acc, email) => {
            const fromEmail = this.extractEmailFromString(email.from).toLowerCase();
            if (fromEmail && !hubspotEmails.has(fromEmail)) {
                const existing = acc.find(c => c.email === fromEmail);
                if (!existing) {
                    acc.push({
                        name: this.extractNameFromEmail(email.from),
                        email: fromEmail,
                        source: 'email',
                        lastContact: email.receivedAt,
                        lastSubject: email.subject
                    });
                }
            }
            return acc;
        }, []).slice(0, 5);
        const vectorResults = await this.searchVectorStore(userId, args.query, 8, 'contacts');
        const contactVectorResults = vectorResults.filter(doc => doc.metadata.source === 'hubspot_contact' || doc.metadata.source === 'hubspot_note');
        const notes = await prisma.hubspotNote.findMany({
            where: {
                userId,
                content: { contains: args.query, mode: 'insensitive' }
            },
            include: {
                contact: true
            },
            take: 5,
            orderBy: { createdAt: 'desc' }
        });
        const formattedContacts = contacts.map(contact => ({
            name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            hubspotId: contact.hubspotId,
            source: 'hubspot'
        }));
        const formattedResponse = [];
        if (formattedContacts.length > 0) {
            formattedResponse.push(`**HubSpot Contacts (${formattedContacts.length}):**`);
            formattedContacts.forEach((contact, i) => {
                const company = contact.company ? ` at ${contact.company}` : '';
                const phone = contact.phone ? ` (${contact.phone})` : '';
                formattedResponse.push(`${i + 1}. ${contact.name}${company}\n   Email: ${contact.email || 'N/A'}${phone}`);
            });
        }
        if (uniqueEmailContacts.length > 0) {
            if (formattedResponse.length > 0)
                formattedResponse.push('');
            formattedResponse.push(`**Email Contacts (${uniqueEmailContacts.length}):**`);
            uniqueEmailContacts.forEach((contact, i) => {
                const lastDate = new Date(contact.lastContact).toLocaleDateString();
                formattedResponse.push(`${i + 1}. ${contact.name}\n   Email: ${contact.email}\n   Last contact: ${lastDate} - "${contact.lastSubject}"`);
            });
        }
        if (notes.length > 0) {
            if (formattedResponse.length > 0)
                formattedResponse.push('');
            formattedResponse.push(`**Related Notes (${notes.length}):**`);
            notes.forEach((note, i) => {
                const contactName = `${note.contact.firstName || ''} ${note.contact.lastName || ''}`.trim();
                const snippet = note.content.substring(0, 100) + (note.content.length > 100 ? '...' : '');
                formattedResponse.push(`${i + 1}. Note about ${contactName}:\n   "${snippet}"`);
            });
        }
        const totalFound = formattedContacts.length + uniqueEmailContacts.length;
        return {
            count: totalFound,
            formattedResponse: totalFound > 0
                ? formattedResponse.join('\n')
                : `No contacts found matching "${args.query}". Try searching by name, email, company, or phone number.`,
            contacts: formattedContacts,
            emailContacts: uniqueEmailContacts,
            relatedNotes: notes.map(note => ({
                content: note.content.substring(0, 200) + '...',
                contactName: `${note.contact.firstName || ''} ${note.contact.lastName || ''}`.trim(),
                contactEmail: note.contact.email,
                date: note.createdAt
            })),
            vectorMatches: contactVectorResults.length > 0 ? contactVectorResults.map(doc => ({
                content: doc.content.substring(0, 200) + '...',
                source: doc.metadata.title || 'HubSpot Data',
                contactName: doc.metadata.contactName
            })) : undefined
        };
    }
    async handleScheduleAppointment(userId, args) {
        try {
            let contactEmail = '';
            let contactFound = false;
            try {
                const hubspotContacts = await hubspotService.searchContacts(userId, args.contactName);
                if (hubspotContacts.length > 0) {
                    const contact = hubspotContacts[0];
                    contactEmail = contact.email || contact.properties?.email;
                    contactFound = true;
                }
            }
            catch (error) {
                console.log('HubSpot search failed, trying email search');
            }
            if (!contactFound) {
                try {
                    const emails = await googleService.searchEmails(userId, args.contactName);
                    if (emails.length > 0) {
                        const email = emails[0];
                        const fromMatch = email.from.match(/<(.+?)>/) || email.from.match(/(\S+@\S+)/);
                        if (fromMatch) {
                            contactEmail = fromMatch[1] || fromMatch[0];
                            contactFound = true;
                        }
                    }
                }
                catch (error) {
                    console.log('Email search failed');
                }
            }
            if (!contactFound || !contactEmail) {
                return {
                    success: false,
                    message: `Could not find contact information for ${args.contactName}. Please provide their email address.`
                };
            }
            const duration = args.duration || 30;
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            const endDate = new Date(tomorrow);
            endDate.setDate(endDate.getDate() + 7);
            const availableSlots = [
                { date: 'Tomorrow', time: '9:00 AM' },
                { date: 'Tomorrow', time: '2:00 PM' },
                { date: 'Day after tomorrow', time: '10:00 AM' },
                { date: 'Day after tomorrow', time: '3:00 PM' }
            ];
            const emailSubject = `Meeting Request: ${args.description || 'Appointment'}`;
            const emailBody = `Hi ${args.contactName},

I hope this email finds you well. I'd like to schedule a ${duration}-minute meeting with you to discuss ${args.description || 'our upcoming collaboration'}.

I have the following time slots available:
${availableSlots.map(slot => `• ${slot.date} at ${slot.time}`).join('\n')}

Please let me know which time works best for you, or if you'd prefer a different time. I'm happy to accommodate your schedule.

Looking forward to hearing from you!

Best regards`;
            await this.handleSendEmail(userId, {
                to: contactEmail,
                subject: emailSubject,
                body: emailBody
            });
            await taskService.createMultiStepTask(userId, {
                title: `Schedule appointment with ${args.contactName}`,
                description: `Complete appointment scheduling workflow with ${args.contactName}`,
                priority: 'medium',
                steps: [
                    {
                        title: `Send initial meeting request to ${args.contactName}`,
                        description: `Email sent with available time slots`,
                        metadata: {
                            type: 'send_email',
                            contactEmail: contactEmail,
                            emailSent: true,
                            availableSlots: availableSlots
                        }
                    },
                    {
                        title: `Wait for response from ${args.contactName}`,
                        description: `Waiting for ${args.contactName} to respond with their availability`,
                        metadata: {
                            type: 'wait_response',
                            contactName: args.contactName,
                            contactEmail: contactEmail,
                            expectedResponseType: 'meeting_acceptance'
                        }
                    },
                    {
                        title: `Create calendar event and send confirmation`,
                        description: `Final step: create the meeting and confirm with attendee`,
                        metadata: {
                            type: 'create_meeting',
                            duration: duration,
                            description: args.description
                        }
                    }
                ],
                metadata: {
                    type: 'schedule_appointment',
                    contactName: args.contactName,
                    contactEmail: contactEmail,
                    duration: duration,
                    description: args.description,
                    totalSteps: 3
                }
            });
            const allTasks = await taskService.getPendingTasks(userId);
            const appointmentTask = allTasks.find(task => task.metadata?.type === 'multi_step_parent' &&
                task.title.includes(`Schedule appointment with ${args.contactName}`));
            if (appointmentTask && appointmentTask.subTasks.length >= 2) {
                await taskService.updateTask(userId, appointmentTask.subTasks[0].id, {
                    status: 'completed',
                    completedAt: new Date().toISOString()
                });
                await taskService.updateTask(userId, appointmentTask.subTasks[1].id, {
                    status: 'waiting_response'
                });
            }
            return {
                success: true,
                message: `Meeting request sent to ${args.contactName} at ${contactEmail}. I've provided them with available time slots and am waiting for their response.`
            };
        }
        catch (error) {
            console.error('Error scheduling appointment:', error);
            await taskService.createTask(userId, {
                title: `Failed: Schedule appointment with ${args.contactName}`,
                description: args.description || `Schedule a ${args.duration || 30} minute appointment`,
                priority: 'high',
                metadata: {
                    type: 'schedule_appointment_failed',
                    contactName: args.contactName,
                    duration: args.duration || 30,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
            return {
                success: false,
                error: `Failed to schedule appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async handleSendEmail(userId, args) {
        try {
            const result = await googleService.sendEmail(userId, {
                to: args.to,
                subject: args.subject,
                body: args.body
            });
            await taskService.createTask(userId, {
                title: `Send email to ${args.to}`,
                description: `Subject: ${args.subject}`,
                priority: 'medium',
                metadata: {
                    type: 'send_email',
                    to: args.to,
                    subject: args.subject,
                    body: args.body,
                    status: 'completed',
                    messageId: result.messageId
                }
            });
            return {
                success: true,
                messageId: result.messageId,
                message: `Email sent successfully to ${args.to}`
            };
        }
        catch (error) {
            console.error('Error sending email:', error);
            await taskService.createTask(userId, {
                title: `Failed: Send email to ${args.to}`,
                description: `Subject: ${args.subject}`,
                priority: 'medium',
                metadata: {
                    type: 'send_email',
                    to: args.to,
                    subject: args.subject,
                    body: args.body,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
            return {
                success: false,
                error: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async handleCreateTask(userId, args) {
        const task = await taskService.createTask(userId, {
            title: args.title,
            description: args.description,
            priority: args.priority || 'medium',
            metadata: {
                type: 'user_task',
                status: 'pending'
            }
        });
        return task;
    }
    async handleAddOngoingInstruction(userId, args) {
        try {
            const instructionText = args.instruction.trim();
            const existingInstruction = await prisma.ongoingInstruction.findFirst({
                where: {
                    userId,
                    instruction: {
                        contains: instructionText,
                        mode: 'insensitive'
                    },
                    isActive: true
                }
            });
            if (existingInstruction) {
                return {
                    success: false,
                    error: `Similar instruction already exists: "${existingInstruction.instruction}"`
                };
            }
            const instruction = await prisma.ongoingInstruction.create({
                data: {
                    userId,
                    instruction: instructionText,
                    isActive: true
                }
            });
            return {
                success: true,
                instruction: instruction,
                message: `Added ongoing instruction: "${args.instruction}"`
            };
        }
        catch (error) {
            console.error('Error adding ongoing instruction:', error);
            return {
                success: false,
                error: 'Failed to add ongoing instruction'
            };
        }
    }
    async handleSendEmailToContact(userId, args) {
        try {
            const contact = await prisma.hubspotContact.findFirst({
                where: {
                    userId,
                    OR: [
                        { firstName: { contains: args.contactName, mode: 'insensitive' } },
                        { lastName: { contains: args.contactName, mode: 'insensitive' } },
                        { email: { contains: args.contactName, mode: 'insensitive' } }
                    ]
                }
            });
            if (!contact) {
                return {
                    success: false,
                    error: `Contact "${args.contactName}" not found in HubSpot`
                };
            }
            const task = await taskService.createTask(userId, {
                title: `Send email to ${contact.firstName} ${contact.lastName}`,
                description: `Subject: ${args.subject}`,
                priority: 'medium',
                metadata: {
                    type: 'send_email_to_contact',
                    contactId: contact.id,
                    contactEmail: contact.email,
                    contactName: `${contact.firstName} ${contact.lastName}`,
                    subject: args.subject,
                    body: args.body,
                    status: 'pending_send'
                }
            });
            return {
                success: true,
                task: task,
                message: `Created task to send email to ${contact.firstName} ${contact.lastName} (${contact.email})`
            };
        }
        catch (error) {
            console.error('Error sending email to contact:', error);
            return {
                success: false,
                error: 'Failed to send email to contact'
            };
        }
    }
    async handleCreateHubspotContact(userId, args) {
        try {
            const existingContact = await prisma.hubspotContact.findFirst({
                where: {
                    userId,
                    email: args.email
                }
            });
            if (existingContact) {
                return {
                    success: false,
                    error: `Contact with email ${args.email} already exists`
                };
            }
            const contact = await prisma.hubspotContact.create({
                data: {
                    userId,
                    email: args.email,
                    firstName: args.firstName || '',
                    lastName: args.lastName || '',
                    company: args.company || '',
                    hubspotId: `temp_${Date.now()}`
                }
            });
            if (args.note) {
                await prisma.hubspotNote.create({
                    data: {
                        userId,
                        contactId: contact.id,
                        hubspotNoteId: `temp_note_${Date.now()}`,
                        content: args.note
                    }
                });
            }
            const task = await taskService.createTask(userId, {
                title: `Create HubSpot contact for ${args.email}`,
                description: `Create contact: ${args.firstName} ${args.lastName} at ${args.company}`,
                priority: 'medium',
                metadata: {
                    type: 'create_hubspot_contact',
                    contactId: contact.id,
                    email: args.email,
                    firstName: args.firstName,
                    lastName: args.lastName,
                    company: args.company,
                    note: args.note,
                    status: 'pending_hubspot_sync'
                }
            });
            return {
                success: true,
                contact: contact,
                task: task,
                message: `Created local contact for ${args.email} and scheduled HubSpot sync`
            };
        }
        catch (error) {
            console.error('Error creating HubSpot contact:', error);
            return {
                success: false,
                error: 'Failed to create HubSpot contact'
            };
        }
    }
    async processWebhookWithInstructions(userId, webhookSource, webhookData) {
        try {
            const instructions = await prisma.ongoingInstruction.findMany({
                where: { userId, isActive: true }
            });
            if (instructions.length === 0) {
                return;
            }
            const context = `A webhook event occurred:
Source: ${webhookSource}
Data: ${JSON.stringify(webhookData, null, 2)}

Consider the following ongoing instructions and determine if any actions should be taken:
${instructions.map(i => `- ${i.instruction}`).join('\n')}

If any action should be taken based on these instructions, use the available tools to execute them.`;
            await this.processMessage(userId, 'webhook', context);
        }
        catch (error) {
            console.error('Error processing webhook with instructions:', error);
        }
    }
    async handleSearchCalendar(userId, args) {
        try {
            const query = args.query.toLowerCase();
            let dateFilter = {};
            if (args.startDate && args.endDate) {
                let startDate, endDate;
                if (args.startDate.toLowerCase() === 'today') {
                    startDate = new Date();
                    startDate.setHours(0, 0, 0, 0);
                }
                else if (args.startDate.toLowerCase() === 'tomorrow') {
                    startDate = new Date();
                    startDate.setDate(startDate.getDate() + 1);
                    startDate.setHours(0, 0, 0, 0);
                }
                else {
                    startDate = new Date(args.startDate);
                }
                if (args.endDate.toLowerCase() === 'today') {
                    endDate = new Date();
                    endDate.setHours(23, 59, 59, 999);
                }
                else if (args.endDate.toLowerCase() === 'tomorrow') {
                    endDate = new Date();
                    endDate.setDate(endDate.getDate() + 1);
                    endDate.setHours(23, 59, 59, 999);
                }
                else {
                    endDate = new Date(args.endDate);
                }
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    throw new Error(`Invalid date format. StartDate: ${args.startDate}, EndDate: ${args.endDate}`);
                }
                dateFilter = {
                    startTime: { gte: startDate },
                    endTime: { lte: endDate }
                };
            }
            else {
                if (query.includes('today')) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(today);
                    endOfDay.setHours(23, 59, 59, 999);
                    dateFilter = { startTime: { gte: today, lte: endOfDay } };
                }
                else if (query.includes('tomorrow')) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(0, 0, 0, 0);
                    const endOfTomorrow = new Date(tomorrow);
                    endOfTomorrow.setHours(23, 59, 59, 999);
                    dateFilter = { startTime: { gte: tomorrow, lte: endOfTomorrow } };
                }
                else if (query.includes('this week') || query.includes('during this week')) {
                    const now = new Date();
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay());
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 6);
                    endOfWeek.setHours(23, 59, 59, 999);
                    dateFilter = { startTime: { gte: startOfWeek, lte: endOfWeek } };
                }
                else if (query.includes('this month')) {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    dateFilter = { startTime: { gte: startOfMonth, lte: endOfMonth } };
                }
                else if (query.includes('upcoming') || query.includes('future') || query.includes('scheduled')) {
                    dateFilter = { startTime: { gte: new Date() } };
                }
            }
            const whereClause = { userId, ...dateFilter };
            const generalQueries = ['upcoming', 'future', 'scheduled', 'planned', 'all', 'any', 'my', 'events'];
            const isGeneralQuery = generalQueries.some(term => args.query.toLowerCase().includes(term))
                || query.includes('today') || query.includes('tomorrow') || query.includes('this week') || query.includes('this month');
            if (!isGeneralQuery) {
                whereClause.OR = [
                    { title: { contains: args.query, mode: 'insensitive' } },
                    { description: { contains: args.query, mode: 'insensitive' } },
                    { location: { contains: args.query, mode: 'insensitive' } }
                ];
            }
            const events = await prisma.calendarEvent.findMany({
                where: whereClause,
                orderBy: { startTime: 'asc' },
                take: 20
            });
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
            const userEmail = user?.email;
            const allAttendeeEmails = [...new Set(events.flatMap(event => event.attendees || []))];
            const hubspotContacts = await prisma.hubspotContact.findMany({
                where: {
                    userId,
                    email: { in: allAttendeeEmails }
                }
            });
            const formattedEvents = events.map(event => {
                const start = new Date(event.startTime).toLocaleString();
                const otherAttendees = event.attendees?.filter(email => email !== userEmail) || [];
                const attendeesList = otherAttendees.length > 0
                    ? `\n  Attendees: ${otherAttendees.join(', ')}`
                    : '';
                const location = event.location ? `\n  Location: ${event.location}` : '';
                const description = event.description ? `\n  Description: ${event.description}` : '';
                return `• ${event.title}\n  Time: ${start}${location}${attendeesList}${description}`;
            }).join('\n\n');
            const meetingBlocks = events.map(event => {
                const startDate = new Date(event.startTime);
                const endDate = new Date(event.endTime);
                const timeRange = `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const attendeeObjects = (event.attendees || [])
                    .filter(email => email !== userEmail)
                    .map(email => {
                    const contact = hubspotContacts.find(c => c.email === email);
                    const name = contact ? `${contact.firstName} ${contact.lastName}`.trim() : email.split('@')[0];
                    return {
                        name,
                        email,
                        avatar: null
                    };
                });
                return {
                    id: event.id,
                    title: event.title,
                    date: dateStr,
                    timeRange,
                    attendees: attendeeObjects,
                    location: event.location,
                    description: event.description
                };
            });
            return {
                count: events.length,
                formattedResponse: events.length > 0
                    ? `Found ${events.length} upcoming calendar event${events.length > 1 ? 's' : ''}:\n\n${formattedEvents}`
                    : "No upcoming calendar events found.",
                meetingBlocks,
                events: events.map(event => {
                    const enrichedAttendees = (event.attendees || []).map(email => {
                        const contact = hubspotContacts.find(c => c.email === email);
                        return {
                            email,
                            name: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
                            firstName: contact?.firstName,
                            lastName: contact?.lastName,
                            company: contact?.company
                        };
                    });
                    return {
                        id: event.id,
                        googleEventId: event.googleEventId,
                        title: event.title,
                        description: event.description,
                        startTime: event.startTime,
                        endTime: event.endTime,
                        attendees: event.attendees,
                        enrichedAttendees,
                        location: event.location
                    };
                })
            };
        }
        catch (error) {
            console.error('Error searching calendar:', error);
            return {
                success: false,
                error: 'Failed to search calendar events'
            };
        }
    }
    async handleCreateCalendarEvent(userId, args) {
        try {
            if (!args.title || args.title.trim().length < 3) {
                return {
                    success: false,
                    error: "Please provide a meaningful meeting title/subject.",
                    needsInput: {
                        missing: ["title"],
                        message: "I need a proper meeting title to create this event. What should this meeting be about?"
                    }
                };
            }
            if (!args.attendees || args.attendees.length === 0) {
                const personalKeywords = ['personal', 'reminder', 'break', 'lunch', 'block', 'focus', 'work'];
                const isPersonalEvent = personalKeywords.some(keyword => args.title.toLowerCase().includes(keyword) ||
                    (args.description && args.description.toLowerCase().includes(keyword)));
                if (!isPersonalEvent) {
                    return {
                        success: false,
                        error: "Please specify who should attend this meeting.",
                        needsInput: {
                            missing: ["attendees"],
                            message: "Who should be invited to this meeting? Please provide email addresses of attendees."
                        }
                    };
                }
            }
            const startDate = new Date(args.startTime);
            const endDate = new Date(args.endTime);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return {
                    success: false,
                    error: "Invalid date/time format. Please provide valid start and end times.",
                    needsInput: {
                        missing: ["startTime", "endTime"],
                        message: "When should this meeting take place? Please specify the date and time."
                    }
                };
            }
            if (endDate <= startDate) {
                return {
                    success: false,
                    error: "End time must be after start time.",
                    needsInput: {
                        missing: ["endTime"],
                        message: "Please provide a valid end time that's after the start time."
                    }
                };
            }
            const result = await googleService.createCalendarEvent(userId, {
                title: args.title,
                description: args.description,
                startTime: args.startTime,
                endTime: args.endTime,
                attendees: args.attendees || [],
                location: args.location
            });
            if (result.success) {
                try {
                    await googleService.syncCalendar(userId);
                    console.log(`Calendar sync triggered after creating event "${args.title}" for user ${userId}`);
                }
                catch (syncError) {
                    console.error('Failed to trigger calendar sync after creation:', syncError);
                }
                return {
                    success: true,
                    event: result.event,
                    message: `✅ Successfully scheduled "${args.title}" for ${new Date(args.startTime).toLocaleString()}`
                };
            }
            else {
                const task = await taskService.createTask(userId, {
                    title: `Create calendar event: ${args.title}`,
                    description: `Event from ${args.startTime} to ${args.endTime}`,
                    priority: 'medium',
                    metadata: {
                        type: 'create_calendar_event',
                        eventTitle: args.title,
                        eventDescription: args.description,
                        startTime: args.startTime,
                        endTime: args.endTime,
                        attendees: args.attendees || [],
                        location: args.location,
                        status: 'pending_creation'
                    }
                });
                return {
                    success: true,
                    task: task,
                    message: `⏳ Created task to schedule "${args.title}" from ${new Date(args.startTime).toLocaleString()} to ${new Date(args.endTime).toLocaleString()}`
                };
            }
        }
        catch (error) {
            console.error('Error creating calendar event:', error);
            return {
                success: false,
                error: 'Failed to create calendar event'
            };
        }
    }
    async handleDeleteCalendarEvents(userId, args) {
        try {
            const searchResult = await this.handleSearchCalendar(userId, args);
            if (!searchResult.events || searchResult.events.length === 0) {
                return {
                    success: true,
                    message: "No matching events found to delete.",
                    deletedCount: 0
                };
            }
            let deletedCount = 0;
            const errors = [];
            for (const event of searchResult.events) {
                try {
                    const result = await googleService.deleteCalendarEvent(userId, event.googleEventId);
                    if (result.success) {
                        await prisma.calendarEvent.deleteMany({
                            where: {
                                userId,
                                id: event.id
                            }
                        });
                        deletedCount++;
                    }
                    else {
                        errors.push(`Failed to delete "${event.title}": ${result.error}`);
                    }
                }
                catch (error) {
                    console.error(`Error deleting event ${event.title}:`, error);
                    errors.push(`Error deleting "${event.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            const message = deletedCount > 0
                ? `✅ Successfully deleted ${deletedCount} event${deletedCount > 1 ? 's' : ''}.`
                : "❌ No events were deleted.";
            const errorMessage = errors.length > 0 ? `\n⚠️ Errors: ${errors.join(', ')}` : '';
            if (deletedCount > 0) {
                try {
                    await googleService.syncCalendar(userId);
                    console.log(`Calendar sync triggered after deleting ${deletedCount} events for user ${userId}`);
                }
                catch (syncError) {
                    console.error('Failed to trigger calendar sync after deletion:', syncError);
                }
            }
            return {
                success: deletedCount > 0,
                message: message + errorMessage,
                deletedCount,
                errors: errors.length > 0 ? errors : undefined
            };
        }
        catch (error) {
            console.error('Error deleting calendar events:', error);
            return {
                success: false,
                error: 'Failed to delete calendar events'
            };
        }
    }
    async handleProcessAppointmentResponse(userId, args) {
        try {
            const waitingTasks = await taskService.getWaitingTasks(userId);
            const appointmentTask = waitingTasks.find(task => task.metadata?.type === 'wait_response' &&
                task.metadata?.contactName?.toLowerCase().includes(args.contactName.toLowerCase()));
            if (!appointmentTask) {
                return {
                    success: false,
                    error: `No pending appointment request found for ${args.contactName}`
                };
            }
            await taskService.resumeWaitingTask(userId, appointmentTask.id, {
                responseType: args.responseType,
                selectedTime: args.selectedTime,
                alternativeTime: args.alternativeTime,
                responseText: args.responseText,
                processedAt: new Date().toISOString()
            });
            switch (args.responseType) {
                case 'accepted':
                    if (args.selectedTime) {
                        const startTime = new Date(args.selectedTime);
                        const endTime = new Date(startTime);
                        endTime.setMinutes(endTime.getMinutes() + (appointmentTask.metadata.duration || 30));
                        const calendarResult = await this.handleCreateCalendarEvent(userId, {
                            title: `Meeting with ${args.contactName}`,
                            description: appointmentTask.metadata.description || 'Scheduled meeting',
                            startTime: startTime.toISOString(),
                            endTime: endTime.toISOString(),
                            attendees: [appointmentTask.metadata.contactEmail]
                        });
                        if (calendarResult.success) {
                            await this.handleSendEmail(userId, {
                                to: appointmentTask.metadata.contactEmail,
                                subject: `Meeting Confirmed: ${args.selectedTime}`,
                                body: `Hi ${args.contactName},\n\nGreat! I've confirmed our meeting for ${startTime.toLocaleString()}.\n\nLooking forward to speaking with you!\n\nBest regards`
                            });
                            await taskService.advanceToNextStep(userId, appointmentTask.id);
                            return {
                                success: true,
                                message: `✅ Meeting confirmed with ${args.contactName} for ${startTime.toLocaleString()}. Calendar event created and confirmation sent.`
                            };
                        }
                    }
                    break;
                case 'alternative_time':
                    if (args.alternativeTime) {
                        await this.handleSendEmail(userId, {
                            to: appointmentTask.metadata.contactEmail,
                            subject: `Re: Meeting Request - Alternative Time`,
                            body: `Hi ${args.contactName},\n\nThank you for getting back to me. I can accommodate ${args.alternativeTime}. Let me confirm this works on my end and I'll send you a calendar invite.\n\nBest regards`
                        });
                        await taskService.updateTask(userId, appointmentTask.id, {
                            metadata: {
                                ...appointmentTask.metadata,
                                alternativeTimeProposed: args.alternativeTime,
                                awaitingFinalConfirmation: true
                            }
                        });
                        return {
                            success: true,
                            message: `📅 Responded to ${args.contactName}'s alternative time suggestion. Awaiting final confirmation.`
                        };
                    }
                    break;
                case 'declined':
                    await taskService.updateTask(userId, appointmentTask.id, {
                        status: 'completed',
                        completedAt: new Date().toISOString(),
                        metadata: {
                            ...appointmentTask.metadata,
                            declined: true,
                            declineReason: args.responseText
                        }
                    });
                    return {
                        success: true,
                        message: `❌ ${args.contactName} declined the meeting request. Task marked as completed.`
                    };
                case 'unclear':
                    await this.handleSendEmail(userId, {
                        to: appointmentTask.metadata.contactEmail,
                        subject: `Re: Meeting Request - Clarification Needed`,
                        body: `Hi ${args.contactName},\n\nThank you for your response. Could you please clarify your availability? I originally proposed these times:\n\n${appointmentTask.metadata.availableSlots?.map((slot) => `• ${slot.date} at ${slot.time}`).join('\n') || 'Various times'}\n\nPlease let me know which works best for you, or suggest an alternative.\n\nBest regards`
                    });
                    return {
                        success: true,
                        message: `❓ Sent clarification email to ${args.contactName} due to unclear response.`
                    };
            }
            return {
                success: true,
                message: `Processed response from ${args.contactName}: ${args.responseType}`
            };
        }
        catch (error) {
            console.error('Error processing appointment response:', error);
            return {
                success: false,
                error: `Failed to process appointment response: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async handleListAllContacts(userId, args) {
        const limit = args.limit || 50;
        try {
            const contacts = await prisma.hubspotContact.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: limit
            });
            const companyGroups = contacts.reduce((acc, contact) => {
                const company = contact.company || 'No Company';
                if (!acc[company])
                    acc[company] = [];
                acc[company].push(contact);
                return acc;
            }, {});
            const formattedResponse = [];
            formattedResponse.push(`**Total Contacts: ${contacts.length}**\n`);
            Object.entries(companyGroups).forEach(([company, companyContacts]) => {
                if (companyContacts.length > 0) {
                    formattedResponse.push(`**${company} (${companyContacts.length})**:`);
                    companyContacts.forEach((contact, i) => {
                        const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
                        const email = contact.email ? ` - ${contact.email}` : '';
                        const phone = contact.phone ? ` - ${contact.phone}` : '';
                        formattedResponse.push(`  ${i + 1}. ${name}${email}${phone}`);
                    });
                    formattedResponse.push('');
                }
            });
            return {
                count: contacts.length,
                formattedResponse: formattedResponse.join('\n'),
                contacts: contacts.map(contact => ({
                    name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
                    email: contact.email,
                    phone: contact.phone,
                    company: contact.company,
                    hubspotId: contact.hubspotId
                })),
                summary: {
                    totalContacts: contacts.length,
                    companies: Object.keys(companyGroups).length,
                    contactsByCompany: Object.entries(companyGroups).map(([company, contacts]) => ({
                        company,
                        count: contacts.length
                    }))
                }
            };
        }
        catch (error) {
            console.error('Error listing all contacts:', error);
            return {
                count: 0,
                formattedResponse: "Failed to retrieve contacts. Please try again.",
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    extractEmailFromString(emailString) {
        if (!emailString)
            return '';
        const emailMatch = emailString.match(/<(.+?)>/) || emailString.match(/(\S+@\S+)/);
        return emailMatch ? emailMatch[1] : emailString;
    }
    extractNameFromEmail(emailString) {
        if (!emailString)
            return 'Unknown';
        const nameMatch = emailString.match(/^([^<]+)\s*</);
        if (nameMatch) {
            return nameMatch[1].trim().replace(/"/g, '');
        }
        const email = this.extractEmailFromString(emailString);
        const username = email.split('@')[0];
        return username
            .replace(/[._]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}
