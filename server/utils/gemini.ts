import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];

export interface ConversationTurn {
  role: "user" | "model";
  parts: { text: string }[];
}

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function generateWithRetry(contents: string | ConversationTurn[], maxRetries = 2) {
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
