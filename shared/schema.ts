import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  ouraData: jsonb("oura_data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export const ouraQuerySchema = z.object({
  query: z.string().min(1, "Please enter a question").max(500, "Please keep your question under 500 characters"),
});

export type OuraQuery = z.infer<typeof ouraQuerySchema>;

export interface OuraSleepData {
  id: string;
  day: string;
  score: number | null;
  contributors: {
    deep_sleep: number;
    efficiency: number;
    latency: number;
    rem_sleep: number;
    restfulness: number;
    timing: number;
    total_sleep: number;
  };
  bedtime_start?: string | null;
  bedtime_end?: string | null;
  total_sleep_duration?: number | null;
  time_in_bed?: number | null;
  awake_time?: number | null;
  rem_sleep_duration?: number | null;
  deep_sleep_duration?: number | null;
  light_sleep_duration?: number | null;
  restless_periods?: number | null;
  average_heart_rate?: number | null;
  lowest_heart_rate?: number | null;
  average_hrv?: number | null;
  efficiency?: number | null;
}

export interface OuraActivityData {
  id: string;
  day: string;
  score: number | null;
  active_calories: number;
  steps: number;
  equivalent_walking_distance: number;
  high_activity_time: number;
  medium_activity_time: number;
  low_activity_time: number;
  sedentary_time: number;
  total_calories?: number;
  target_calories?: number;
  resting_time?: number;
  inactivity_alerts?: number;
  met?: unknown;
  class_5_min?: unknown;
  workouts?: unknown[];
}

export interface OuraReadinessData {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation: number | null;
  temperature_trend_deviation?: number | null;
  contributors: {
    activity_balance: number;
    body_temperature: number;
    hrv_balance: number;
    previous_day_activity: number;
    previous_night: number;
    recovery_index: number;
    resting_heart_rate: number;
    sleep_balance: number;
  };
}

export interface OuraHeartRateDataPoint {
  bpm: number;
  source: string;
  timestamp: string;
}

export interface OuraHeartRateDailyStat {
  day: string;
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface OuraHeartRatePayload {
  readings?: OuraHeartRateDataPoint[];
  dailyStats?: OuraHeartRateDailyStat[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  ouraData?: {
    sleep?: OuraSleepData[];
    activity?: OuraActivityData[];
    readiness?: OuraReadinessData[];
    heartRate?: OuraHeartRatePayload;
  };
}
