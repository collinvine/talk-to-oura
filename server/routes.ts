import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { registerAuthRoutes } from "./routes/auth";
import { registerDataRoutes } from "./routes/data";
import { registerQueryRoute } from "./routes/query";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Prevent search engines from indexing the app
  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.type("text/plain");
    res.send("User-agent: *\nDisallow: /");
  });

  registerAuthRoutes(app);
  registerDataRoutes(app);
  registerQueryRoute(app);

  return httpServer;
}

declare module "express-session" {
  interface SessionData {
    oauthState?: string;
  }
}
