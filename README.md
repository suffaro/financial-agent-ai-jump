# LINK TO THE APPLICATION

https://financial-agent-ai-jump.onrender.com

I used wrong link in the email, I'm sorry about that.


# Financial Advisor AI Agent

An intelligent AI assistant that integrates Gmail, Google Calendar, and HubSpot to provide comprehensive financial advisory support through natural language interactions.

## 🛠️ Tech Stack

**Frontend:**
- React 18 with TypeScript
- Axios for API calls
- React Hot Toast for notifications
- Lucide React for icons
- Tailwind CSS for styling

**Backend:**
- Node.js with Express
- TypeScript
- Prisma ORM with PostgreSQL
- pgvector extension for vector similarity search
- Passport.js for OAuth authentication
- JWT for session management

**Database:**
- PostgreSQL with pgvector extension
- Vector embeddings for semantic search
- Automated migrations with Prisma

**AI & ML:**
- **LLM:** Llama-3.1-8B-Instant (via Groq)
- **Embeddings:** sentence-transformers/all-MiniLM-L6-v2 (via HuggingFace)
- **Vector Search:** pgvector for RAG 

## 🔌 Integrations

**APIs Used:**
- **Google APIs:** Gmail, Calendar, OAuth
- **HubSpot API:** CRM contacts and notes
- **Groq API:** Fast LLM inference
- **HuggingFace API:** Text embeddings

## 🏗️ Architecture

### Core Application Flow:
1. **Authentication:** Google OAuth handles user login
2. **Data Ingestion:** Background sync of emails, calendar events, and CRM data
3. **Vector Processing:** Text content converted to embeddings using all-MiniLM-L6-v2
4. **Storage:** Data stored in PostgreSQL with vector representations
5. **AI Interaction:** User queries processed through RAG pipeline with Llama model

### Key Components:
- **Sync Service:** Automated background data synchronization
- **Vector Store:** Semantic search across all integrated data
- **AI Service:** LLM interactions with context from vector search
- **Rate Limiting:** API protection with exponential backoff
- **Webhook System:** Real-time updates (partial implementation)


## 🚀 Features Implemented

### ✅ Core Features:
- **AI Chat Interface:** Natural language queries with contextual responses
- **Google Integration:** Gmail and Calendar sync with OAuth
- **HubSpot Integration:** CRM contacts and notes synchronization
- **Vector Search:** Semantic search across all integrated data using pgvector
- **Background Sync:** Automated data polling every 5 minutes
- **Task Management:** AI-powered task creation and tracking
- **User Authentication:** Secure JWT-based sessions with Google OAuth

### ✅ Additional Features:
- **Integrations Dashboard:** Visual status and manual sync controls
- **Debug Mode:** Function call visibility in settings for development
- **Rate Limiting:** API protection with emergency bypass capability
- **Error Handling:** Comprehensive error recovery and user feedback
- **Progress Tracking:** Real-time sync progress indicators

## 🚧 Current Limitations & Technical Debt

### Critical Issues:
1. **LLM Reliability:** Llama-3.1-8B via Groq sometimes makes poor decisions despite strict system prompts
   - **Impact:** Core AI functionality can be unreliable for complex financial queries
   - **Root Cause:** Free tier constraints and model limitations
   - **Recommended Solution:** Upgrade to OpenAI GPT-4 for better consistency
   - **Alternative:** Replace HuggingFace embeddings with OpenAI's text-embedding models

2. **Rate Limiting Challenges:** 
   - **Current State:** Emergency bypass mode enabled due to API rate limits
   - **Risk:** Potential API quota exhaustion in production
   - **Groq Limitations:** Free tier has restrictive rate limits affecting user experience

### Incomplete Features:
3. **Webhook Implementation:** 60-70% complete
   - **Current:** Polling-based sync (5-minute intervals)
   - **Missing:** Real-time webhook processing for immediate updates
   - **Impact:** Delayed data synchronization

4. **Email Filtering Intelligence:** 
   - **Goal:** Filter promotional/spam emails to focus on relevant business communications
   - **Status:** Basic filtering implemented but needs ML-based improvement
   - **Current Filters:** Basic domain/keyword filtering

5. **UI/UX Polish:**
   - **Status:** Functional but not matching original design specifications
   - **Areas:** Visual consistency, responsive design, loading states

### Technical Improvements Needed:
- **Testing Coverage:** Limited HubSpot integration testing due to development constraints
- **Performance Optimization:** Vector search needs optimization for large datasets
- **Security Enhancements:** Enhanced input validation and sanitization
- **Production Monitoring:** Comprehensive logging and error tracking system

## 🛠️ Development Setup

### Prerequisites:
- Node.js 18+
- PostgreSQL with pgvector extension
- Docker & Docker Compose

### Environment Variables:
```bash
# Copy example environment file
cp env.example .env

# Required API keys:
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
HUBSPOT_CLIENT_ID=your_hubspot_client_id
HUBSPOT_CLIENT_SECRET=your_hubspot_client_secret
GROQ_API_KEY=your_groq_api_key
HUGGINGFACE_API_KEY=your_huggingface_api_key
```

### Quick Start (Docker):
The recommended way to run the project is using Docker Compose.
```bash
# Build and start all services in the background.
# This command also handles database setup and migrations.
docker-compose up --build -d
```
The application will then be available at `http://localhost:3002`.

### Manual Setup (without Docker):
If you prefer to run the services manually on your host machine:
```bash
# 1. Install dependencies for both server and client
npm run install:all

# 2. Ensure you have a PostgreSQL database with pgvector running
#    and the DATABASE_URL is set in your .env file.

# 3. Run database migrations
npm run db:migrate

# 4. Start the backend and frontend servers concurrently
npm run dev
```

### API Rate Limits (Current):
- **Groq:** Limited free tier requests
- **HuggingFace:** 30,000 characters/month free
- **Google APIs:** 100 requests/100 seconds (configurable)
- **HubSpot:** 100 requests/10 seconds (configurable)

## 🚀 Deployment

Ready for deployment on Render with:
- Automated PostgreSQL database setup with pgvector
- Environment variable configuration
- OAuth callback URL management
- Production-ready builds with optimizations

## 🔧 Technical Architecture Details

### Vector Search Implementation:
- **Embedding Model:** sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
- **Similarity Function:** Cosine similarity using pgvector
- **Indexing:** HNSW index for efficient similarity search
- **Context Window:** Up to 4000 tokens for LLM context

### Data Flow:
1. **Ingestion:** APIs → Background sync → Raw data storage
2. **Processing:** Text extraction → Embedding generation → Vector storage  
3. **Retrieval:** User query → Vector search → Context assembly
4. **Generation:** Context + Query → LLM → Response + Actions

### Security Features:
- JWT tokens with 7-day expiration
- OAuth 2.0 with Google and HubSpot
- Rate limiting with exponential backoff
- Input sanitization and validation
- Secure session management





 