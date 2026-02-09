import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import crypto from "crypto";
import {
  isOAuthConfigured,
  isConnected,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  checkConnection,
  getSleepData,
  getActivityData,
  getReadinessData,
  getHeartRateData,
  getTodayMetrics,
  getAllOuraData,
  getAllOuraDataByDateRange,
} from "./oura";
import { ouraQuerySchema } from "@shared/schema";
import { OuraCache } from "./cache";

const queryCache = new OuraCache();

// Use direct Gemini API (not Replit proxy)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Models to try in order (with fallback)
const MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];

interface ConversationTurn {
  role: "user" | "model";
  parts: { text: string }[];
}

async function generateWithRetry(contents: string | ConversationTurn[], maxRetries = 2) {
  let lastError: any = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const config = model.includes("gemini-3") ? {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        } : {};

        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config,
        });

        console.log(`Using model: ${model}`);
        return stream;
      } catch (error: any) {
        lastError = error;
        const is429 = error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");

        if (is429 && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.log(`Rate limited on ${model}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (is429) {
          console.log(`Rate limited on ${model}, trying fallback model...`);
          break;
        } else {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error("All models failed");
}

interface DateRange {
  startDate: string;
  endDate: string;
  usesCustomRange: boolean;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseDateRangeFromQuery(query: string, today: Date): DateRange | null {
  const q = query.toLowerCase();
  const todayStr = formatDate(today);

  const toRange = (start: Date, end: Date): DateRange => ({
    startDate: formatDate(start),
    endDate: formatDate(end),
    usesCustomRange: true,
  });

  const rangeMatch = q.match(/(\d{4}-\d{2}-\d{2})\s*(to|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return {
      startDate: rangeMatch[1],
      endDate: rangeMatch[3],
      usesCustomRange: true,
    };
  }

  const singleDateMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (singleDateMatch) {
    return {
      startDate: singleDateMatch[1],
      endDate: singleDateMatch[1],
      usesCustomRange: true,
    };
  }

  if (/\b(today)\b/.test(q)) {
    return { startDate: todayStr, endDate: todayStr, usesCustomRange: true };
  }

  if (/\b(yesterday|last night)\b/.test(q)) {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    return { startDate: formatDate(date), endDate: formatDate(date), usesCustomRange: true };
  }

  const relativeMatch = q.match(/\b(last|past|previous)\s+(\d+)\s+(days?|weeks?|months?|years?)\b/);
  if (relativeMatch) {
    const amount = Number(relativeMatch[2]);
    const unit = relativeMatch[3];
    let days = amount;
    if (unit.startsWith("week")) days = amount * 7;
    if (unit.startsWith("month")) days = amount * 30;
    if (unit.startsWith("year")) days = amount * 365;
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    return toRange(start, today);
  }

  if (/\bthis\s+week\b/.test(q) || /\blast\s+week\b/.test(q)) {
    const start = new Date(today);
    start.setDate(start.getDate() - 7);
    return toRange(start, today);
  }

  if (/\bthis\s+month\b/.test(q)) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return toRange(start, today);
  }

  if (/\blast\s+month\b/.test(q)) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return toRange(start, end);
  }

  if (/\bthis\s+year\b/.test(q)) {
    const start = new Date(today.getFullYear(), 0, 1);
    return toRange(start, today);
  }

  if (/\blast\s+year\b/.test(q)) {
    const start = new Date(today.getFullYear() - 1, 0, 1);
    const end = new Date(today.getFullYear() - 1, 11, 31);
    return toRange(start, end);
  }

  const yearMatch = q.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return toRange(start, end);
  }

  return null;
}

async function extractDateRange(query: string): Promise<DateRange> {
  const today = new Date();
  const todayStr = formatDate(today);

  const defaultRange: DateRange = {
    startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: todayStr,
    usesCustomRange: false,
  };

  const parsedRange = parseDateRangeFromQuery(query, today);
  if (parsedRange) {
    if (parsedRange.startDate > parsedRange.endDate) {
      return {
        startDate: parsedRange.endDate,
        endDate: parsedRange.startDate,
        usesCustomRange: true,
      };
    }
    return {
      ...parsedRange,
      endDate: parsedRange.endDate > todayStr ? todayStr : parsedRange.endDate,
    };
  }

  // Updated patterns to catch years and broader terms
  const datePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
    /\b(last|past|previous)\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i,
    /\b(this|last|past|previous)\s+(week|month|year)\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/i,
    /\b20\d{2}\b/, // Matches years like 2024, 2025
    /\b(year|yr)\b/i // Matches the word "year" explicitly
  ];

  const hasDateReference = datePatterns.some(pattern => pattern.test(query));

  if (!hasDateReference) {
    return defaultRange;
  }

  try {
    const extractionPrompt = `Extract the date range from this health data question. Today's date is ${todayStr}.

Question: "${query}"

Return ONLY a JSON object with startDate and endDate in YYYY-MM-DD format. No explanation.
Rules:
- "last night" or "yesterday": use yesterday's date for both
- "today": use today's date for both  
- "last week": use 7 days ago to today
- "last month": use 30 days ago to today
- "year 2025" or "in 2025": use "2025-01-01" to "2025-12-31"
- "last year": use the full previous calendar year
- "last X days": use X days ago to today

Example response: {"startDate": "2025-12-01", "endDate": "2025-12-31"}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview", // Using the updated model name from user edit
      contents: extractionPrompt,
    });

    let fullText = "";
    for await (const chunk of stream) {
      fullText += chunk.text || "";
    }

    const jsonMatch = fullText.trim().match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.startDate && parsed.endDate) {
        let startDate = parsed.startDate;
        let endDate = parsed.endDate;

        if (startDate > endDate) {
          [startDate, endDate] = [endDate, startDate];
        }

        if (endDate > todayStr) {
          endDate = todayStr;
        }

        console.log(`Extracted date range: ${startDate} to ${endDate}`);
        return {
          startDate,
          endDate,
          usesCustomRange: true,
        };
      }
    }
  } catch (error) {
    console.error("Date extraction failed, using default range:", error);
  }

  return defaultRange;
}

function getRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/auth/oura/callback`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Prevent search engines from indexing the app
  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.type("text/plain");
    res.send("User-agent: *\nDisallow: /");
  });

  app.get("/api/auth/oura", (req: Request, res: Response) => {
    if (!isOAuthConfigured()) {
      return res.status(500).json({
        error: "OAuth not configured. OURA_CLIENT_ID and OURA_CLIENT_SECRET are required."
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;

    const redirectUri = getRedirectUri(req);
    console.log("OAuth redirect URI:", redirectUri);
    const authUrl = getAuthorizationUrl(redirectUri, state);

    res.json({ authUrl, redirectUri });
  });

  app.get("/api/auth/oura/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect("/?error=access_denied");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/?error=no_code");
    }

    if (state !== req.session.oauthState) {
      return res.redirect("/?error=invalid_state");
    }

    delete req.session.oauthState;

    const redirectUri = getRedirectUri(req);
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens) {
      return res.redirect("/?error=token_exchange_failed");
    }

    req.session.ouraAccessToken = tokens.accessToken;
    req.session.ouraRefreshToken = tokens.refreshToken;
    req.session.ouraTokenExpiry = Date.now() + tokens.expiresIn * 1000;

    res.redirect("/?connected=true");
  });

  app.post("/api/auth/oura/disconnect", (req: Request, res: Response) => {
    delete req.session.ouraAccessToken;
    delete req.session.ouraRefreshToken;
    delete req.session.ouraTokenExpiry;

    res.json({ success: true });
  });

  app.get("/api/oura/status", async (req: Request, res: Response) => {
    try {
      if (!isOAuthConfigured()) {
        return res.json({ connected: false, reason: "oauth_not_configured" });
      }

      if (!isConnected(req)) {
        return res.json({ connected: false, reason: "not_authenticated" });
      }

      const connected = await checkConnection(req);
      res.json({ connected, reason: connected ? "ok" : "invalid_token" });
    } catch (error) {
      console.error("Error checking Oura status:", error);
      res.json({ connected: false, reason: "error" });
    }
  });

  app.get("/api/oura/metrics", async (req: Request, res: Response) => {
    try {
      if (!isConnected(req)) {
        return res.status(401).json({ error: "Not connected to Oura" });
      }
      const metrics = await getTodayMetrics(req);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/oura/sleep", async (req: Request, res: Response) => {
    try {
      if (!isConnected(req)) {
        return res.status(401).json({ error: "Not connected to Oura" });
      }
      const days = parseInt(req.query.days as string) || 7;
      const data = await getSleepData(req, days);
      res.json(data);
    } catch (error) {
      console.error("Error fetching sleep data:", error);
      res.status(500).json({ error: "Failed to fetch sleep data" });
    }
  });

  app.get("/api/oura/activity", async (req: Request, res: Response) => {
    try {
      if (!isConnected(req)) {
        return res.status(401).json({ error: "Not connected to Oura" });
      }
      const days = parseInt(req.query.days as string) || 7;
      const data = await getActivityData(req, days);
      res.json(data);
    } catch (error) {
      console.error("Error fetching activity data:", error);
      res.status(500).json({ error: "Failed to fetch activity data" });
    }
  });

  app.get("/api/oura/readiness", async (req: Request, res: Response) => {
    try {
      if (!isConnected(req)) {
        return res.status(401).json({ error: "Not connected to Oura" });
      }
      const days = parseInt(req.query.days as string) || 7;
      const data = await getReadinessData(req, days);
      res.json(data);
    } catch (error) {
      console.error("Error fetching readiness data:", error);
      res.status(500).json({ error: "Failed to fetch readiness data" });
    }
  });

  app.get("/api/oura/heartrate", async (req: Request, res: Response) => {
    try {
      if (!isConnected(req)) {
        return res.status(401).json({ error: "Not connected to Oura" });
      }
      const days = parseInt(req.query.days as string) || 1;
      const data = await getHeartRateData(req, days);
      res.json(data);
    } catch (error) {
      console.error("Error fetching heart rate data:", error);
      res.status(500).json({ error: "Failed to fetch heart rate data" });
    }
  });

  app.post("/api/oura/query", async (req: Request, res: Response) => {
    try {
      const parsed = ouraQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Query is required" });
      }
      const { query, conversationHistory } = parsed.data;

      if (!isConnected(req)) {
        return res.status(401).json({
          error: "Please connect your Oura ring first."
        });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const dateRange = await extractDateRange(query);
      console.log(`Query date range: ${dateRange.startDate} to ${dateRange.endDate} (custom: ${dateRange.usesCustomRange})`);

      // OPTIMIZED DATA FETCHING LOGIC
      // Move the "what data does the user want" logic BEFORE the fetch
      const queryLower = query.toLowerCase();

      // Keywords detection
      const wantsSleep = queryLower.includes("sleep") || queryLower.includes("rest") || queryLower.includes("night") || queryLower.includes("bed") || queryLower.includes("rem") || queryLower.includes("deep") || queryLower.includes("awake");
      const wantsActivity = queryLower.includes("activity") || queryLower.includes("step") || queryLower.includes("active") || queryLower.includes("exercise") || queryLower.includes("workout") || queryLower.includes("calories") || queryLower.includes("move");
      const wantsReadiness = queryLower.includes("readiness") || queryLower.includes("recovery") || queryLower.includes("ready") || queryLower.includes("stress") || queryLower.includes("strain");
      const wantsHeartRate = queryLower.includes("heart") || queryLower.includes("hr") || queryLower.includes("bpm") || queryLower.includes("pulse");

      const noSpecificType = !wantsSleep && !wantsActivity && !wantsReadiness && !wantsHeartRate;

      // Define what to include
      const includeSleep = wantsSleep || noSpecificType;
      const includeActivity = wantsActivity || noSpecificType; // Fallback to fetching basic stats if unsure
      const includeReadiness = wantsReadiness || noSpecificType;
      // IMPORTANT: Do NOT default to fetching Heart Rate for long ranges unless explicitly asked
      const includeHeartRate = wantsHeartRate;

      const neededTypes = {
        sleep: includeSleep,
        activity: includeActivity,
        readiness: includeReadiness,
        heartRate: includeHeartRate
      };

      let ouraData: any = null;
      let usedCache = false;
      const sessionId = req.sessionID;
      const cachedEntry = queryCache.get(sessionId);

      // Cache Logic
      if (cachedEntry) {
        // Case 1: Follow-up query (no specific date detected, uses default range)
        if (!dateRange.usesCustomRange) {
          console.log("Using cached data for follow-up query");
          // Update the date range to match what we have in cache so the prompt is correct
          dateRange.startDate = cachedEntry.startDate;
          dateRange.endDate = cachedEntry.endDate;
          dateRange.usesCustomRange = true; // Treat as custom so we report the correct range description

          ouraData = cachedEntry.data;
          usedCache = true;
        }
        // Case 2: Specific date range requested, check if cache covers it
        else if (queryCache.matches(cachedEntry, dateRange.startDate, dateRange.endDate, neededTypes)) {
          console.log(`Using cached data (subset) for range ${dateRange.startDate} to ${dateRange.endDate}`);
          ouraData = queryCache.filterData(cachedEntry, dateRange.startDate, dateRange.endDate);
          usedCache = true;
        }
      }

      if (!ouraData) {
        console.log("Fetching fresh data from Oura API");
        ouraData = dateRange.usesCustomRange
          ? await getAllOuraDataByDateRange(req, dateRange.startDate, dateRange.endDate, {
            includeSleep,
            includeActivity,
            includeReadiness,
            includeHeartRate
          })
          : await getAllOuraData(req, 7);

        // Cache the new data
        if (sessionId) {
          queryCache.set(sessionId, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            data: ouraData,
            includedTypes: neededTypes
          });
        }
      }

      const hasData = ouraData.sleep.length > 0 || ouraData.activity.length > 0 ||
        ouraData.readiness.length > 0 || ouraData.heartRate.readings.length > 0;

      if (!hasData) {
        const noDataMsg = dateRange.usesCustomRange
          ? `I couldn't find any data from your Oura ring for the period ${dateRange.startDate} to ${dateRange.endDate}. Please make sure your ring was synced during that time.`
          : "I couldn't find any recent data from your Oura ring. Please make sure your ring is synced and try again.";
        res.write(`data: ${JSON.stringify({ content: noDataMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        return res.end();
      }

      const dateRangeDescription = dateRange.usesCustomRange
        ? `from ${dateRange.startDate} to ${dateRange.endDate}`
        : "from the last 7 days";

      // Detect which data types are relevant to the query (already done above, reusing variables)

      // Build data sections only for relevant types
      let dataSections = "";
      let heartRateSummary: Array<{ day: string; min: number | null; max: number | null; avg: number | null }> = [];

      if (includeSleep) {
        dataSections += `\nSLEEP DATA:\n${JSON.stringify(ouraData.sleep)}`;
      }

      if (includeActivity) {
        dataSections += `\nACTIVITY DATA:\n${JSON.stringify(ouraData.activity)}`;
      }

      if (includeReadiness) {
        dataSections += `\nREADINESS DATA:\n${JSON.stringify(ouraData.readiness)}`;
      }

      if (includeHeartRate) {
        // Only include daily summaries, not individual readings
        heartRateSummary = Object.entries(ouraData.heartRate.dailyStats).map(([day, stats]: [string, any]) => ({
          day,
          min: stats.min === Infinity ? null : stats.min,
          max: stats.max === -Infinity ? null : stats.max,
          avg: stats.avg || null,
        }));
        dataSections += `\nHEART RATE DAILY SUMMARY (min/max/avg bpm per day):\n${JSON.stringify(heartRateSummary)}`;
      }

      const systemContext = `You are a helpful health assistant that analyzes Oura ring data.
You have access to the user's sleep, activity, readiness, and heart rate data from their Oura ring.
Provide insightful, personalized responses based on the data.
Be conversational and supportive. Use specific numbers and dates from the data.
If asked about trends, compare recent days. If asked about specific metrics, explain what they mean.
Keep responses concise but informative. Use plain language.

Here is the user's Oura data ${dateRangeDescription}:
${dataSections}`;

      // Build multi-turn conversation for follow-up context
      const conversationTurns: ConversationTurn[] = [];

      if (conversationHistory && conversationHistory.length > 0) {
        // Include system context as the first user turn, paired with an acknowledgment
        conversationTurns.push({
          role: "user",
          parts: [{ text: systemContext + "\n\nPlease use the above data context for this conversation." }],
        });
        conversationTurns.push({
          role: "model",
          parts: [{ text: "I have the Oura data ready. I'll use it to answer your questions about your health metrics." }],
        });

        // Add previous conversation turns (limit to last 10 messages to manage token usage)
        const recentHistory = conversationHistory.slice(-10);
        for (const msg of recentHistory) {
          conversationTurns.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          });
        }

        // Add the current query
        conversationTurns.push({
          role: "user",
          parts: [{ text: query }],
        });
      }

      const streamInput = conversationTurns.length > 0
        ? conversationTurns
        : `${systemContext}\n\nUSER QUESTION: ${query}\n\nPlease analyze the data and answer the user's question.`;

      const stream = await generateWithRetry(streamInput);

      let fullResponse = "";

      for await (const chunk of stream) {
        const text = chunk.text || "";
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }

      // Reuse the detection from above for client response
      const relevantData: any = {};
      if (includeSleep) relevantData.sleep = ouraData.sleep;
      if (includeActivity) relevantData.activity = ouraData.activity;
      if (includeReadiness) relevantData.readiness = ouraData.readiness;
      if (includeHeartRate) {
        relevantData.heartRate = { dailyStats: heartRateSummary };
      }

      res.write(`data: ${JSON.stringify({ ouraData: Object.keys(relevantData).length > 0 ? relevantData : null, done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      const errorDetails = error?.response?.data || error?.cause || null;
      console.error("Error processing query:", errorMessage);
      if (errorDetails) {
        console.error("Error details:", JSON.stringify(errorDetails, null, 2));
      }
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: `Failed to process query: ${errorMessage}` })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process query", details: errorMessage });
      }
    }
  });

  return httpServer;
}

declare module "express-session" {
  interface SessionData {
    oauthState?: string;
  }
}
