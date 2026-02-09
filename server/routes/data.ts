import type { Request, Response, Router } from "express";
import {
  isOAuthConfigured,
  isConnected,
  checkConnection,
  getSleepData,
  getActivityData,
  getReadinessData,
  getHeartRateData,
  getTodayMetrics,
} from "../oura";

export function registerDataRoutes(router: Router): void {
  router.get("/api/oura/status", async (req: Request, res: Response) => {
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

  router.get("/api/oura/metrics", async (req: Request, res: Response) => {
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

  router.get("/api/oura/sleep", async (req: Request, res: Response) => {
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

  router.get("/api/oura/activity", async (req: Request, res: Response) => {
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

  router.get("/api/oura/readiness", async (req: Request, res: Response) => {
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

  router.get("/api/oura/heartrate", async (req: Request, res: Response) => {
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
}
