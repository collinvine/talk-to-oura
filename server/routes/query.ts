import type { Request, Response, Router } from "express";
import { isConnected, getAllOuraData, getAllOuraDataByDateRange } from "../oura";
import { ouraQuerySchema } from "@shared/schema";
import { OuraCache } from "../cache";
import { extractDateRange } from "../utils/date-range";
import { ai, generateWithRetry, type ConversationTurn } from "../utils/gemini";

const queryCache = new OuraCache();

interface DataTypeFlags {
  sleep: boolean;
  activity: boolean;
  readiness: boolean;
  heartRate: boolean;
}

function detectRelevantDataTypes(query: string): DataTypeFlags {
  const q = query.toLowerCase();

  const wantsSleep = q.includes("sleep") || q.includes("rest") || q.includes("night") || q.includes("bed") || q.includes("rem") || q.includes("deep") || q.includes("awake");
  const wantsActivity = q.includes("activity") || q.includes("step") || q.includes("active") || q.includes("exercise") || q.includes("workout") || q.includes("calories") || q.includes("move");
  const wantsReadiness = q.includes("readiness") || q.includes("recovery") || q.includes("ready") || q.includes("stress") || q.includes("strain");
  const wantsHeartRate = q.includes("heart") || q.includes("hr") || q.includes("bpm") || q.includes("pulse");

  const noSpecificType = !wantsSleep && !wantsActivity && !wantsReadiness && !wantsHeartRate;

  return {
    sleep: wantsSleep || noSpecificType,
    activity: wantsActivity || noSpecificType,
    readiness: wantsReadiness || noSpecificType,
    heartRate: wantsHeartRate, // Only fetch HR when explicitly asked
  };
}

function buildDataSections(ouraData: any, dataTypes: DataTypeFlags): string {
  let dataSections = "";

  if (dataTypes.sleep) {
    dataSections += `\nSLEEP DATA:\n${JSON.stringify(ouraData.sleep)}`;
  }

  if (dataTypes.activity) {
    dataSections += `\nACTIVITY DATA:\n${JSON.stringify(ouraData.activity)}`;
  }

  if (dataTypes.readiness) {
    dataSections += `\nREADINESS DATA:\n${JSON.stringify(ouraData.readiness)}`;
  }

  if (dataTypes.heartRate) {
    const heartRateSummary = Object.entries(ouraData.heartRate.dailyStats).map(([day, stats]: [string, any]) => ({
      day,
      min: stats.min === Infinity ? null : stats.min,
      max: stats.max === -Infinity ? null : stats.max,
      avg: stats.avg || null,
    }));
    dataSections += `\nHEART RATE DAILY SUMMARY (min/max/avg bpm per day):\n${JSON.stringify(heartRateSummary)}`;
  }

  return dataSections;
}

function buildSystemContext(dateRangeDescription: string, dataSections: string): string {
  return `You are a helpful health assistant that analyzes Oura ring data.
You have access to the user's sleep, activity, readiness, and heart rate data from their Oura ring.
Provide insightful, personalized responses based on the data.
Be conversational and supportive. Use specific numbers and dates from the data.
If asked about trends, compare recent days. If asked about specific metrics, explain what they mean.
Keep responses concise but informative. Use plain language.

Here is the user's Oura data ${dateRangeDescription}:
${dataSections}`;
}

function buildStreamInput(
  query: string,
  systemContext: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): string | ConversationTurn[] {
  const conversationTurns: ConversationTurn[] = [];

  if (conversationHistory && conversationHistory.length > 0) {
    conversationTurns.push({
      role: "user",
      parts: [{ text: systemContext + "\n\nPlease use the above data context for this conversation." }],
    });
    conversationTurns.push({
      role: "model",
      parts: [{ text: "I have the Oura data ready. I'll use it to answer your questions about your health metrics." }],
    });

    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      conversationTurns.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    conversationTurns.push({
      role: "user",
      parts: [{ text: query }],
    });

    return conversationTurns;
  }

  return `${systemContext}\n\nUSER QUESTION: ${query}\n\nPlease analyze the data and answer the user's question.`;
}

function buildRelevantDataPayload(ouraData: any, dataTypes: DataTypeFlags) {
  const relevantData: any = {};
  if (dataTypes.sleep) relevantData.sleep = ouraData.sleep;
  if (dataTypes.activity) relevantData.activity = ouraData.activity;
  if (dataTypes.readiness) relevantData.readiness = ouraData.readiness;
  if (dataTypes.heartRate) {
    const heartRateSummary = Object.entries(ouraData.heartRate.dailyStats).map(([day, stats]: [string, any]) => ({
      day,
      min: stats.min === Infinity ? null : stats.min,
      max: stats.max === -Infinity ? null : stats.max,
      avg: stats.avg || null,
    }));
    relevantData.heartRate = { dailyStats: heartRateSummary };
  }
  return Object.keys(relevantData).length > 0 ? relevantData : null;
}

export function registerQueryRoute(router: Router): void {
  router.post("/api/oura/query", async (req: Request, res: Response) => {
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

      const dateRange = await extractDateRange(query, ai);
      console.log(`Query date range: ${dateRange.startDate} to ${dateRange.endDate} (custom: ${dateRange.usesCustomRange})`);

      const dataTypes = detectRelevantDataTypes(query);

      let ouraData: any = null;
      const sessionId = req.sessionID;
      const cachedEntry = queryCache.get(sessionId);

      if (cachedEntry) {
        if (!dateRange.usesCustomRange) {
          console.log("Using cached data for follow-up query");
          dateRange.startDate = cachedEntry.startDate;
          dateRange.endDate = cachedEntry.endDate;
          dateRange.usesCustomRange = true;
          ouraData = cachedEntry.data;
        } else if (queryCache.matches(cachedEntry, dateRange.startDate, dateRange.endDate, dataTypes)) {
          console.log(`Using cached data (subset) for range ${dateRange.startDate} to ${dateRange.endDate}`);
          ouraData = queryCache.filterData(cachedEntry, dateRange.startDate, dateRange.endDate);
        }
      }

      if (!ouraData) {
        console.log("Fetching fresh data from Oura API");
        ouraData = dateRange.usesCustomRange
          ? await getAllOuraDataByDateRange(req, dateRange.startDate, dateRange.endDate, {
            includeSleep: dataTypes.sleep,
            includeActivity: dataTypes.activity,
            includeReadiness: dataTypes.readiness,
            includeHeartRate: dataTypes.heartRate,
          })
          : await getAllOuraData(req, 7);

        if (sessionId) {
          queryCache.set(sessionId, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            data: ouraData,
            includedTypes: dataTypes,
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

      const dataSections = buildDataSections(ouraData, dataTypes);
      const systemContext = buildSystemContext(dateRangeDescription, dataSections);
      const streamInput = buildStreamInput(query, systemContext, conversationHistory);
      const stream = await generateWithRetry(streamInput);

      for await (const chunk of stream) {
        const text = chunk.text || "";
        if (text) {
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }

      const relevantData = buildRelevantDataPayload(ouraData, dataTypes);
      res.write(`data: ${JSON.stringify({ ouraData: relevantData, done: true })}\n\n`);
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
}
