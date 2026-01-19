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

// Use direct Gemini API (not Replit proxy)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Models to try in order (with fallback)
const MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];

async function generateWithRetry(prompt: string, maxRetries = 2) {
  let lastError: any = null;
  
  for (const model of MODELS) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const config = model.includes("gemini-3") ? {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        } : {};
        
        const stream = await ai.models.generateContentStream({
          model,
          contents: prompt,
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

async function extractDateRange(query: string): Promise<DateRange> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  
  const defaultRange: DateRange = {
    startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: todayStr,
    usesCustomRange: false,
  };
  
  const datePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
    /\b(last|past)\s+(\d+)\s+(days?|weeks?|months?)\b/i,
    /\b(this|last)\s+(week|month|year)\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/i,
  ];
  
  const hasDateReference = datePatterns.some(pattern => pattern.test(query));
  
  if (!hasDateReference) {
    return defaultRange;
  }
  
  try {
    const extractionPrompt = `Extract the date range from this health data question. Today's date is ${todayStr}.

Question: "${query}"

Return ONLY a JSON object with startDate and endDate in YYYY-MM-DD format. No explanation.
If the question mentions:
- "last night" or "yesterday": use yesterday's date for both
- "today": use today's date for both  
- "last week": use 7 days ago to today
- "last month": use 30 days ago to today
- A specific month like "December 2025": use the first and last day of that month
- "last X days": use X days ago to today

Example response: {"startDate": "2025-12-01", "endDate": "2025-12-31"}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
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
      const { query } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

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
      
      const ouraData = dateRange.usesCustomRange 
        ? await getAllOuraDataByDateRange(req, dateRange.startDate, dateRange.endDate)
        : await getAllOuraData(req, 7);

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

      // Detect which data types are relevant to the query
      const queryLower = query.toLowerCase();
      const wantsSleep = queryLower.includes("sleep") || queryLower.includes("rest") || queryLower.includes("night") || queryLower.includes("bed") || queryLower.includes("rem") || queryLower.includes("deep");
      const wantsActivity = queryLower.includes("activity") || queryLower.includes("step") || queryLower.includes("active") || queryLower.includes("exercise") || queryLower.includes("workout") || queryLower.includes("calories") || queryLower.includes("move");
      const wantsReadiness = queryLower.includes("readiness") || queryLower.includes("recovery") || queryLower.includes("ready") || queryLower.includes("stress") || queryLower.includes("strain");
      const wantsHeartRate = queryLower.includes("heart") || queryLower.includes("hr") || queryLower.includes("bpm") || queryLower.includes("pulse") || queryLower.includes("resting");
      
      // If no specific data type detected, default to sleep and readiness only (most common, smallest token footprint)
      const noSpecificType = !wantsSleep && !wantsActivity && !wantsReadiness && !wantsHeartRate;
      const includeSleep = wantsSleep || noSpecificType;
      const includeReadiness = wantsReadiness || noSpecificType;
      const includeActivity = wantsActivity;  // Only when explicitly requested
      const includeHeartRate = wantsHeartRate;  // Only when explicitly requested
      
      // Build data sections only for relevant types
      let dataSections = "";
      
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
        const heartRateSummary = Object.entries(ouraData.heartRate.dailyStats).map(([day, stats]: [string, any]) => ({
          day,
          min: stats.min === Infinity ? null : stats.min,
          max: stats.max === -Infinity ? null : stats.max,
          avg: stats.avg || null,
        }));
        dataSections += `\nHEART RATE DAILY SUMMARY (min/max/avg bpm per day):\n${JSON.stringify(heartRateSummary)}`;
      }

      const fullPrompt = `You are a helpful health assistant that analyzes Oura ring data. 
You have access to the user's sleep, activity, readiness, and heart rate data from their Oura ring.
Provide insightful, personalized responses based on the data.
Be conversational and supportive. Use specific numbers and dates from the data.
If asked about trends, compare recent days. If asked about specific metrics, explain what they mean.
Keep responses concise but informative. Use plain language.

Here is the user's Oura data ${dateRangeDescription}:
${dataSections}

USER QUESTION: ${query}

Please analyze the data and answer the user's question.`;

      const stream = await generateWithRetry(fullPrompt);

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
        relevantData.heartRate = { dailyStats: ouraData.heartRate.dailyStats };
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
