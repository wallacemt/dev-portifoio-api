import type { Request, Response } from "express";
import { Router } from "express";
import { trackingRateLimit } from "../middleware/analyticsRateLimit";
import AuthPolice, { sseAuthPolice } from "../middleware/authPolice";
import { AnalyticsService } from "../services/analyticsService";
import type { AnalyticsFilters, TrackPageViewRequest, TrackVisitorRequest } from "../types/analytics";
import { devDebugger } from "../utils/devDebugger";
import errorFilter from "../utils/isCustomError";
import { getRedisClient } from "../utils/redisClient";

const SSE_HEARTBEAT_MS = 25_000;
const SSE_POLL_FALLBACK_MS = 10_000;

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Operações de métricas e analytics do portfólio
 */
export class AnalyticsController {
  routerPrivate: Router;
  routerPublic: Router;
  private analyticsService: AnalyticsService = new AnalyticsService();

  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }

  private routesPublic() {
    this.routerPublic.post("/:ownerId/track-visitor", trackingRateLimit, this.trackVisitor.bind(this));
    this.routerPublic.post("/:ownerId/track-pageview", trackingRateLimit, this.trackPageView.bind(this));
    // Auth própria (aceita token via querystring) porque EventSource não manda headers customizados.
    this.routerPublic.get("/stream", sseAuthPolice, this.streamAnalytics.bind(this));
  }

  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);

    this.routerPrivate.get("/dashboard", this.getAnalytics.bind(this));
    this.routerPrivate.get("/summary", this.getAnalyticsSummary.bind(this));
    this.routerPrivate.get("/realtime", this.getRealTimeAnalytics.bind(this));
    this.routerPrivate.post("/update-daily", this.forceUpdateDailyAnalytics.bind(this));
  }

  async trackVisitor(req: Request, res: Response): Promise<void> {
    try {
      const { ownerId } = req.params;
      const visitorData: TrackVisitorRequest = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

      if (!ownerId) {
        res.status(400).json({
          error: "ID do proprietário é obrigatório",
        });
        return;
      }

      const visitor = await this.analyticsService.trackVisitor(visitorData, ownerId, ipAddress);

      if (visitor.isExisting) {
        res.status(200).json({
          message: "Visitante já registrado",
          visitor: { id: visitor.id, sessionId: visitor.sessionId },
          cached: true,
        });
        return;
      }

      res.status(201).json({
        message: "Visitante registrado com sucesso",
        visitor: { id: visitor.id, sessionId: visitor.sessionId },
        cached: false,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async trackPageView(req: Request, res: Response): Promise<void> {
    try {
      const { ownerId } = req.params;
      const pageViewData: { pageView: TrackPageViewRequest; visitor: TrackVisitorRequest } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

      const pageView = await this.analyticsService.trackPageView(
        pageViewData.pageView,
        ownerId || "",
        pageViewData.visitor,
        ipAddress
      );

      res.status(201).json({
        message: "Visualização registrada com sucesso",
        pageView: { id: pageView.id, page: pageView.page },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAnalytics(req: Request, res: Response) {
    try {
      const filters: AnalyticsFilters = {};

      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }
      if (req.query.page) {
        filters.page = req.query.page as string;
      }
      if (req.query.device) {
        filters.device = req.query.device as "desktop" | "mobile" | "tablet";
      }
      if (req.query.country) {
        filters.country = req.query.country as string;
      }

      const analytics = await this.analyticsService.getAnalytics(req.userId, filters);
      res.status(200).json(analytics);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAnalyticsSummary(req: Request, res: Response) {
    try {
      const summary = await this.analyticsService.getAnalyticsSummary(req.userId);
      res.status(200).json(summary);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getRealTimeAnalytics(req: Request, res: Response) {
    try {
      const realTimeData = await this.analyticsService.getRealTimeAnalytics(req.userId);
      res.status(200).json(realTimeData);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async forceUpdateDailyAnalytics(req: Request, res: Response) {
    try {
      const { date } = req.body;
      const targetDate = date ? new Date(date) : new Date();

      const result = await this.analyticsService.forceUpdateDailyAnalytics(req.userId, targetDate);
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  /**
   * @swagger ver src/docs/paths/analytics.yaml (/api/analytics/stream)
   *
   * SSE de analytics em tempo real. Assina o canal Redis `analytics:{ownerId}`
   * (publicado por trackVisitor/trackPageView) com uma conexão ioredis
   * DEDICADA — a conexão em modo subscribe do ioredis não aceita mais
   * comandos normais, por isso não dá pra reusar o client compartilhado do
   * `getRedisClient()`. Sem Redis disponível, cai pra polling interno.
   */
  async streamAnalytics(req: Request, res: Response): Promise<void> {
    const ownerId = req.userId;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const sendSnapshot = async () => {
      try {
        const [online, realTime] = await Promise.all([
          this.analyticsService.getOnlineVisitorsCount(ownerId),
          this.analyticsService.getRealTimeAnalytics(ownerId),
        ]);
        send("analytics", { online, ...realTime });
      } catch (error) {
        devDebugger("Erro ao enviar snapshot SSE de analytics", error, "warn");
      }
    };

    await sendSnapshot();

    const heartbeat = setInterval(() => res.write(": ping\n\n"), SSE_HEARTBEAT_MS);

    const redisClient = getRedisClient();
    const subscriber = redisClient?.duplicate() ?? null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    if (subscriber) {
      const channel = `analytics:${ownerId}`;
      await subscriber.subscribe(channel);
      subscriber.on("message", () => {
        sendSnapshot();
      });
    } else {
      // Sem Redis: degrada pra polling interno em vez de quebrar o endpoint.
      pollTimer = setInterval(() => sendSnapshot(), SSE_POLL_FALLBACK_MS);
    }

    req.on("close", () => {
      clearInterval(heartbeat);
      if (pollTimer) clearInterval(pollTimer);
      if (subscriber) {
        subscriber
          .unsubscribe()
          .finally(() => subscriber.quit())
          .catch((error) => devDebugger("Erro ao encerrar subscriber SSE de analytics", error, "warn"));
      }
      res.end();
    });
  }
}
