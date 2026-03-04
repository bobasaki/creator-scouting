import type { FastifyInstance } from "fastify";
import {
  bootstrapDiscoveryJobs,
  bootstrapMaintenanceJobs,
  dispatchJobs
} from "../routes/admin";

function parseBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntervalMs(name: string, fallback: number, min: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.trunc(parsed));
}

function parsePositiveInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export function startAutoScheduler(app: FastifyInstance) {
  const timers: NodeJS.Timeout[] = [];

  const dispatchEnabled = parseBooleanEnv(
    "SCHEDULER_AUTO_DISPATCH_ENABLED",
    process.env.NODE_ENV !== "test"
  );
  const discoveryEnabled = parseBooleanEnv("SCHEDULER_AUTO_DISCOVERY_ENABLED", false);
  const refreshEnabled = parseBooleanEnv("SCHEDULER_AUTO_REFRESH_ENABLED", false);
  const enrichEnabled = parseBooleanEnv("SCHEDULER_AUTO_ENRICH_ENABLED", false);

  const dispatchIntervalMs = parseIntervalMs(
    "SCHEDULER_AUTO_DISPATCH_INTERVAL_MS",
    60_000,
    5_000
  );
  const discoveryIntervalMs = parseIntervalMs(
    "SCHEDULER_AUTO_DISCOVERY_INTERVAL_MS",
    6 * 60 * 60 * 1000,
    60_000
  );
  const refreshIntervalMs = parseIntervalMs(
    "SCHEDULER_AUTO_REFRESH_INTERVAL_MS",
    60 * 60 * 1000,
    60_000
  );
  const enrichIntervalMs = parseIntervalMs(
    "SCHEDULER_AUTO_ENRICH_INTERVAL_MS",
    60 * 60 * 1000,
    60_000
  );

  const dispatchLimit = parsePositiveInt("SCHEDULER_AUTO_DISPATCH_LIMIT", 10, 1, 100);
  const discoveryLimit = parsePositiveInt("SCHEDULER_AUTO_DISCOVERY_LIMIT", 20, 1, 200);
  const refreshLimit = parsePositiveInt("SCHEDULER_AUTO_REFRESH_LIMIT", 25, 1, 200);
  const enrichLimit = parsePositiveInt("SCHEDULER_AUTO_ENRICH_LIMIT", 25, 1, 200);
  const refreshStaleAfterDays = parsePositiveInt(
    "SCHEDULER_AUTO_REFRESH_STALE_AFTER_DAYS",
    7,
    0,
    3650
  );
  const enrichStaleAfterDays = parsePositiveInt(
    "SCHEDULER_AUTO_ENRICH_STALE_AFTER_DAYS",
    14,
    0,
    3650
  );
  const enrichMissingOnly = parseBooleanEnv("SCHEDULER_AUTO_ENRICH_MISSING_ONLY", false);
  const workerSuffix = `${process.pid}`;

  function registerLoop(args: {
    enabled: boolean;
    name: string;
    intervalMs: number;
    run: () => Promise<void>;
  }) {
    if (!args.enabled) return;

    let running = false;

    const invoke = async () => {
      if (running) return;
      running = true;
      try {
        await args.run();
      } catch (error) {
        app.log.error({ err: error, loop: args.name }, "Auto scheduler loop failed");
      } finally {
        running = false;
      }
    };

    app.log.info(
      { loop: args.name, interval_ms: args.intervalMs },
      "Auto scheduler loop enabled"
    );

    timers.push(setInterval(() => void invoke(), args.intervalMs));
    void invoke();
  }

  registerLoop({
    enabled: discoveryEnabled,
    name: "discovery-bootstrap",
    intervalMs: discoveryIntervalMs,
    run: async () => {
      const result = await bootstrapDiscoveryJobs({
        limit: discoveryLimit
      });

      if (result.created_count > 0 || result.skipped_count > 0) {
        app.log.info(
          {
            created_count: result.created_count,
            skipped_count: result.skipped_count,
            duplicate_count: result.duplicate_count,
            quota_day: result.day
          },
          "Auto discovery bootstrap completed"
        );
      }
    }
  });

  registerLoop({
    enabled: refreshEnabled,
    name: "refresh-bootstrap",
    intervalMs: refreshIntervalMs,
    run: async () => {
      const result = await bootstrapMaintenanceJobs({
        type: "refresh_metrics",
        input: {
          limit: refreshLimit,
          stale_after_days: refreshStaleAfterDays
        }
      });

      if (result.created_count > 0 || result.skipped_count > 0) {
        app.log.info(
          {
            created_count: result.created_count,
            skipped_count: result.skipped_count,
            duplicate_count: result.duplicate_count,
            quota_day: result.day
          },
          "Auto refresh bootstrap completed"
        );
      }
    }
  });

  registerLoop({
    enabled: enrichEnabled,
    name: "enrich-bootstrap",
    intervalMs: enrichIntervalMs,
    run: async () => {
      const result = await bootstrapMaintenanceJobs({
        type: "enrich",
        input: {
          limit: enrichLimit,
          stale_after_days: enrichStaleAfterDays,
          missing_only: enrichMissingOnly
        }
      });

      if (result.created_count > 0 || result.skipped_count > 0) {
        app.log.info(
          {
            created_count: result.created_count,
            skipped_count: result.skipped_count,
            duplicate_count: result.duplicate_count,
            quota_day: result.day
          },
          "Auto enrich bootstrap completed"
        );
      }
    }
  });

  registerLoop({
    enabled: dispatchEnabled,
    name: "job-dispatch",
    intervalMs: dispatchIntervalMs,
    run: async () => {
      const result = await dispatchJobs(app, {
        limit: dispatchLimit,
        worker_id: `auto-${workerSuffix}`,
        stop_on_error: false
      });

      if (result.claimed_count > 0) {
        app.log.info(
          {
            claimed_count: result.claimed_count,
            dispatched_count: result.dispatched_count,
            requeued_count: result.requeued_count,
            failed_count: result.failed_count
          },
          "Auto dispatched catalog jobs"
        );
      }
    }
  });

  return () => {
    for (const timer of timers) {
      clearInterval(timer);
    }
  };
}
