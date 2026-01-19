# Oura Insights - Natural Language Health Data Query Application

## Overview

This is a health data application that allows users to query their Oura Ring data using natural language. Users can ask questions about their sleep, activity, readiness, and heart rate metrics, and receive AI-powered insights. The application features a modern chat interface inspired by wellness apps like Apple Health and Whoop.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

- **2026-01-05**: Switched from Replit AI Integrations proxy to direct Gemini API with gemini-3-flash-preview model
- **2026-01-05**: Added GEMINI_API_KEY environment variable for direct API access
- **2026-01-04**: Switched from personal access tokens to OAuth 2.0 for Oura authentication
- **2026-01-04**: Added session management for OAuth tokens using express-session
- **2026-01-04**: Updated frontend with OAuth connect flow and callback handling

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Theme**: Light/dark mode support with CSS custom properties
- **Build Tool**: Vite with React plugin

The frontend follows a component-based architecture with:
- Page components in `client/src/pages/`
- Reusable UI components from shadcn/ui in `client/src/components/ui/`
- Feature-specific components in `client/src/components/`
- Custom hooks in `client/src/hooks/`

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Structure**: RESTful endpoints under `/api/`
- **Session Management**: express-session for OAuth token storage

Key backend modules:
- `server/routes.ts` - Main API route registration including OAuth endpoints
- `server/oura.ts` - Oura Ring API integration client with OAuth support
- `server/storage.ts` - In-memory data storage (can be extended to database)
- `server/replit_integrations/` - Pre-built integrations for chat, batch processing, and image generation

### Authentication Flow
1. User clicks "Connect with Oura" button
2. Backend redirects to Oura OAuth authorization URL
3. User authorizes the app on Oura's site
4. Oura redirects back with authorization code
5. Backend exchanges code for access/refresh tokens
6. Tokens stored in session for API calls

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts`
- **Current Storage**: In-memory storage (`MemStorage` class) with database schema ready for PostgreSQL
- **Tables**: users, conversations, messages

The schema supports:
- User authentication (username/password)
- Conversation history with messages
- JSONB field for storing Oura data alongside messages

### AI Integration
- **Provider**: Google Gemini AI via `@google/genai` SDK (direct API, not Replit proxy)
- **Models**: gemini-3-flash-preview (primary, with thinkingLevel: LOW) with fallback to gemini-2.5-flash
- **Configuration**: Uses GEMINI_API_KEY environment variable
- **Features**: Natural language processing for health data queries, streaming responses
- **Rate Limiting**: Automatic retry with exponential backoff and model fallback on 429 errors
- **Date Extraction**: AI-powered parsing of date ranges from natural language (e.g., "December 2025", "last 30 days")
- **Token Optimization**: Smart data filtering - only includes relevant data types in prompts (sleep-only for sleep questions). Heart rate uses daily summaries instead of individual readings.

### External API Integration
- **Oura API**: REST client for Oura Ring v2 API
- **Endpoints**: Sleep, Activity, Readiness, Heart Rate data
- **Authentication**: OAuth 2.0 with access/refresh tokens stored in session

## External Dependencies

### Third-Party Services
- **Oura Ring API** (`api.ouraring.com/v2`): Health data source for sleep, activity, readiness, and heart rate metrics. Uses OAuth 2.0 authentication.
- **Google Gemini AI**: Powers natural language understanding and responses via direct API (gemini-3-flash-preview model).

### Required Environment Variables
- `SESSION_SECRET` - Secret key for session encryption
- `OURA_CLIENT_ID` - OAuth client ID from Oura developer console
- `OURA_CLIENT_SECRET` - OAuth client secret from Oura developer console
- `GEMINI_API_KEY` - API key from Google AI Studio (https://aistudio.google.com/apikey)

### Key NPM Packages
- `@google/genai` - Google AI SDK for Gemini
- `axios` - HTTP client for Oura API calls
- `drizzle-orm` / `drizzle-zod` - Database ORM and schema validation
- `express` / `express-session` - Web server framework with session support
- `@tanstack/react-query` - Frontend data fetching
- `recharts` - Data visualization charts
- `wouter` - Client-side routing
- Full shadcn/ui component library with Radix UI primitives
