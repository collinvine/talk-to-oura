import { GoogleGenAI } from "@google/genai";

export interface DateRange {
  startDate: string;
  endDate: string;
  usesCustomRange: boolean;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function parseDateRangeFromQuery(query: string, today: Date): DateRange | null {
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

const DATE_PATTERNS = [
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
  /\b(last|past|previous)\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i,
  /\b(this|last|past|previous)\s+(week|month|year)\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/i,
  /\b20\d{2}\b/,
  /\b(year|yr)\b/i,
];

export async function extractDateRange(query: string, ai: GoogleGenAI): Promise<DateRange> {
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

  const hasDateReference = DATE_PATTERNS.some(pattern => pattern.test(query));

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
      model: "gemini-3-flash-preview",
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
