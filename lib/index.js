// @deepseek-ai/dsh-usage-monitor — host half.
// Cordis plugin for the DeepSeek Harness Web profile. Registers a JSON HTTP
// route under /usage-monitor that serves:
//   - live per-session token usage (provider-reported buckets + pressure)
//   - HISTORY: real provider-reported usage folded from the persisted
//     session logs (ctx.sessionPersistence), including sessions that are not
//     currently loaded — no heuristics involved
//   - cost computed from the official DeepSeek CNY price list, including the
//     peak/off-peak billing that took effect 2026-08-17 00:00 Beijing time
//     (https://api-docs.deepseek.com/zh-cn/quick_start/pricing)
//   - the DeepSeek platform balance (GET /user/balance), cached with a TTL
// The bundled client half (dist/client.js, dsh.client = platform "web")
// polls this route and renders a floating panel inside the Web GUI.

import { credentialRef } from "@deepseek-ai/dsh-credentials";
import z from "@deepseek-ai/schemastery";

export const name = "usage-monitor";
export const inject = ["webServer", "sessions"];

// Official DeepSeek pricing, CNY per 1M tokens (docs snapshot 2026-08-13).
// Before `effectiveAt`: flat rate. After: peak / off-peak by Beijing hour.
// Cache-write tokens are billed at the cache-miss rate (no separate line).
const OFFICIAL_PRICES = [
  {
    model: "deepseek-v4-flash",
    flat: { cacheHit: 0.02, miss: 1, output: 2 },
    offPeak: { cacheHit: 0.05, miss: 1.5, output: 4.5 },
    peak: { cacheHit: 0.10, miss: 3, output: 9 },
  },
  {
    model: "deepseek-v4-pro",
    flat: { cacheHit: 0.025, miss: 3, output: 6 },
    offPeak: { cacheHit: 0.15, miss: 4.5, output: 13.5 },
    peak: { cacheHit: 0.30, miss: 9, output: 27 },
  },
];
const PEAK_WINDOWS_BEIJING = [[9, 12], [14, 18]];
// 2026-08-17 00:00 Beijing == 2026-08-16T16:00Z.
const PEAK_EFFECTIVE_AT = Date.parse("2026-08-16T16:00:00Z");

export const Config = z.object({
  // HTTP route prefix this plugin serves (the client bundle polls the fixed
  // /usage-monitor/state path; keep the default unless you rebuild the bundle).
  route: z.string().default("/usage-monitor"),
  // DeepSeek platform balance endpoint.
  balanceUrl: z.string().default("https://api.deepseek.com/user/balance"),
  // Credential reference resolved through ctx.credentials (the web Models
  // page writes the same DEEPSEEK_API_KEY the chat adapter uses).
  apiKeyEnv: z.string().default("DEEPSEEK_API_KEY"),
  // How long a successful balance read is reused before refetching.
  balanceTtlMs: z.number().default(60000),
  // Per-request timeout for the balance call.
  balanceTimeoutMs: z.number().default(8000),
  // How long the persisted-log history fold is reused before rescanning.
  historyTtlMs: z.number().default(60000),
  // Peak-billing windows in Beijing hours, and the moment peak/off-peak
  // pricing took effect. Override only when the official pricing page says so.
  peakWindowsBeijing: z.array(z.array(z.number())).default(PEAK_WINDOWS_BEIJING),
  peakEffectiveAt: z.string().default("2026-08-16T16:00:00Z"),
});

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function sendJson(res, status, payload) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

/** Beijing-hour bucket for one timestamp. */
function beijingHour(ts) {
  return new Date(Number(ts) + 8 * 3600 * 1000).getUTCHours();
}

/** Official price triple for one model at one timestamp. */
function priceFor(model, ts, effectiveAt, windows) {
  const row = OFFICIAL_PRICES.find((entry) => entry.model === model) ?? OFFICIAL_PRICES[0];
  const t = Number(ts);
  if (!Number.isFinite(t) || t < effectiveAt) return row.flat;
  const hour = beijingHour(t);
  const peak = windows.some(([start, end]) => hour >= start && hour < end);
  return peak ? row.peak : row.offPeak;
}

/** Cost in CNY from one usage sample and its price triple. */
function costOfSample(uncached, cacheRead, cacheWrite, output, price) {
  return (
    (Number(uncached) + Number(cacheWrite)) * price.miss +
    Number(cacheRead) * price.cacheHit +
    Number(output) * price.output
  ) / 1e6;
}

/** Fold one persisted log into a usage aggregate (real provider reports). */
function foldEvents(events, effectiveAt, windows) {
  const models = {};
  const agg = {
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    costCny: 0,
  };
  // Same last-sample-replacing fold as token-meter's usage projection:
  // the final assistant message of a (turn, step) replaces earlier chunks.
  const lastPerStep = new Map();
  let model = null;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    if (event.type === "request/header") {
      const config = event.data?.header?.config;
      if (config && typeof config.model === "string") model = config.model;
      continue;
    }
    let usage = null;
    if (event.type === "assistant/message" && event.data?.usage) usage = event.data.usage;
    else if (event.type === "assistant/chunk" && event.data?.chunk?.type === "usage") usage = event.data.chunk.usage;
    if (!usage) continue;
    const key = String(event.data?.turn ?? "") + "/" + String(event.data?.step ?? "");
    lastPerStep.set(key, { usage, ts: Number(event.time) || 0, model });
  }
  for (const sample of lastPerStep.values()) {
    const uncached = Number(sample.usage.inputTokens ?? 0);
    const cacheRead = Number(sample.usage.cacheReadTokens ?? 0);
    const cacheWrite = Number(sample.usage.cacheWriteTokens ?? 0);
    const output = Number(sample.usage.outputTokens ?? 0);
    const price = priceFor(sample.model ?? "*", sample.ts, effectiveAt, windows);
    agg.uncachedInputTokens += uncached;
    agg.cacheReadTokens += cacheRead;
    agg.cacheWriteTokens += cacheWrite;
    agg.outputTokens += output;
    agg.costCny += costOfSample(uncached, cacheRead, cacheWrite, output, price);
    const key = sample.model ?? "unknown";
    const bucket = models[key] ??= {
      uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costCny: 0,
    };
    bucket.uncachedInputTokens += uncached;
    bucket.cacheReadTokens += cacheRead;
    bucket.cacheWriteTokens += cacheWrite;
    bucket.outputTokens += output;
    bucket.costCny += costOfSample(uncached, cacheRead, cacheWrite, output, price);
  }
  for (const value of Object.values(models)) value.costCny = Math.round(value.costCny * 1e4) / 1e4;
  agg.costCny = Math.round(agg.costCny * 1e4) / 1e4;
  return { agg, models };
}

export function apply(ctx, config) {
  const route = config.route.endsWith("/") ? config.route.slice(0, -1) : config.route;
  const effectiveAt = Date.parse(config.peakEffectiveAt);
  const windows = config.peakWindowsBeijing;

  // Balance cache. lastError survives between fetches so the panel can show
  // a stale balance together with the freshest failure reason.
  let balance = null;
  let balanceFetchedAt = 0;
  let balanceError = null;
  let balanceInFlight = null;

  // Persisted-history cache: real usage folded from the session logs.
  let history = null;
  let historyFetchedAt = 0;
  let historyError = null;
  let historyInFlight = null;

  async function refreshBalance(force) {
    const now = Date.now();
    if (!force && balance !== null && now - balanceFetchedAt < config.balanceTtlMs) return;
    if (balanceInFlight) return balanceInFlight;
    balanceInFlight = (async () => {
      try {
        const credentials = ctx.get("credentials");
        if (credentials === undefined) {
          balanceError = "credentials service unavailable";
          return;
        }
        const hit = await credentials.resolve(credentialRef(config.apiKeyEnv));
        if (hit === undefined) {
          balanceError = `未配置 ${config.apiKeyEnv}（可在 Web 模型页写入，或导出环境变量）`;
          return;
        }
        const response = await fetch(config.balanceUrl, {
          headers: { authorization: `Bearer ${hit.value}` },
          signal: AbortSignal.timeout(config.balanceTimeoutMs),
        });
        if (!response.ok) {
          balanceError = `余额接口 HTTP ${response.status}`;
          return;
        }
        const body = await response.json();
        const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : [];
        const row = infos.find((entry) => entry?.currency === "CNY") ?? infos[0];
        if (row === undefined) {
          balanceError = "余额接口未返回 balance_infos";
          return;
        }
        balance = {
          currency: row.currency ?? "CNY",
          totalBalance: Number(row.total_balance),
          grantedBalance: Number(row.granted_balance),
          toppedUpBalance: Number(row.topped_up_balance),
        };
        balanceFetchedAt = now;
        balanceError = null;
      } catch (error) {
        balanceError = error instanceof Error ? error.message : String(error);
      } finally {
        balanceInFlight = null;
      }
    })();
    return balanceInFlight;
  }

  async function refreshHistory(force) {
    const now = Date.now();
    if (!force && history !== null && now - historyFetchedAt < config.historyTtlMs) return;
    if (historyInFlight) return historyInFlight;
    historyInFlight = (async () => {
      try {
        const persistence = ctx.get("sessionPersistence");
        if (persistence === undefined) {
          historyError = "sessionPersistence service unavailable";
          return;
        }
        const headers = await persistence.list();
        const total = {
          sessions: 0,
          uncachedInputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          costCny: 0,
          models: {},
        };
        for (const header of headers) {
          try {
            const { events } = await persistence.readFrom(header.id, 0);
            const { agg, models } = foldEvents(events, effectiveAt, windows);
            total.sessions += 1;
            total.uncachedInputTokens += agg.uncachedInputTokens;
            total.cacheReadTokens += agg.cacheReadTokens;
            total.cacheWriteTokens += agg.cacheWriteTokens;
            total.outputTokens += agg.outputTokens;
            total.costCny += agg.costCny;
            for (const [model, bucket] of Object.entries(models)) {
              const t = total.models[model] ??= {
                uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costCny: 0,
              };
              t.uncachedInputTokens += bucket.uncachedInputTokens;
              t.cacheReadTokens += bucket.cacheReadTokens;
              t.cacheWriteTokens += bucket.cacheWriteTokens;
              t.outputTokens += bucket.outputTokens;
              t.costCny += bucket.costCny;
            }
          } catch {
            // a torn log must not break the whole history fold
          }
        }
        total.costCny = Math.round(total.costCny * 1e4) / 1e4;
        for (const value of Object.values(total.models)) value.costCny = Math.round(value.costCny * 1e4) / 1e4;
        history = total;
        historyFetchedAt = now;
        historyError = null;
      } catch (error) {
        historyError = error instanceof Error ? error.message : String(error);
      } finally {
        historyInFlight = null;
      }
    })();
    return historyInFlight;
  }

  function sessionPayload() {
    const sessions = ctx.sessions.list();
    const tokenMeter = ctx.get("tokenMeter");
    const projections = ctx.get("sessionProjections");

    const rows = [];
    const totals = {
      totalTokens: 0,
      surfaceTokens: 0,
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    };

    for (const session of sessions) {
      const row = {
        id: String(session.id),
        title: undefined,
        totalTokens: null,
        surfaceTokens: null,
        usage: null,
        pressure: null,
      };

      let snapshot = null;
      try {
        snapshot = projections === undefined ? null : projections.snapshot(session);
      } catch {
        snapshot = null;
      }
      const usage = snapshot?.values?.tokenUsage;
      const pressure = snapshot?.values?.contextPressure;
      const title = snapshot?.values?.title;
      if (typeof title === "string" && title.length > 0) row.title = title;
      if (usage && typeof usage === "object") {
        row.usage = {
          uncachedInputTokens: Number(usage.uncachedInputTokens ?? 0),
          cacheReadTokens: Number(usage.cacheReadTokens ?? 0),
          cacheWriteTokens: Number(usage.cacheWriteTokens ?? 0),
          outputTokens: Number(usage.outputTokens ?? 0),
        };
      }
      if (pressure && typeof pressure === "object") {
        row.pressure = {
          ...(pressure.pressureTokens !== undefined ? { pressureTokens: Number(pressure.pressureTokens) } : {}),
          ...(pressure.projectedTokens !== undefined ? { projectedTokens: Number(pressure.projectedTokens) } : {}),
          ...(pressure.contextWindow !== undefined ? { contextWindow: Number(pressure.contextWindow) } : {}),
        };
      }

      try {
        if (tokenMeter !== undefined) {
          const measurement = tokenMeter.measure(session);
          row.totalTokens = measurement.totalTokens;
          row.surfaceTokens = measurement.surfaceTokens;
        }
      } catch {
        // a malformed log must not break the whole panel
      }

      if (row.usage !== null) {
        totals.uncachedInputTokens += row.usage.uncachedInputTokens;
        totals.cacheReadTokens += row.usage.cacheReadTokens;
        totals.cacheWriteTokens += row.usage.cacheWriteTokens;
        totals.outputTokens += row.usage.outputTokens;
      }
      if (row.totalTokens !== null) totals.totalTokens += row.totalTokens;
      if (row.surfaceTokens !== null) totals.surfaceTokens += row.surfaceTokens;
      rows.push(row);
    }

    return { rows, totals };
  }

  async function buildPayload(forceBalance) {
    await Promise.all([refreshBalance(forceBalance), refreshHistory(false)]);
    const { rows, totals } = sessionPayload();
    const balanceValue = balance === null
      ? null
      : { ...balance, fetchedAt: balanceFetchedAt };
    // Remaining-token conversion at the current off-peak cache-miss rate of
    // the default model — a balance-to-token scale, not a bill.
    const scalePrice = priceFor("*", Date.now(), effectiveAt, windows);
    return {
      ok: true,
      now: Date.now(),
      balance: balanceValue,
      balanceError: balance === null ? balanceError : (balanceError ?? null),
      remainingTokensEstimate: balanceValue === null
        ? null
        : Math.round(balanceValue.totalBalance / (scalePrice.miss / 1e6)),
      priceMeta: {
        currency: "CNY",
        effectiveAt: config.peakEffectiveAt,
        windows,
        source: "官方价目表 api-docs.deepseek.com",
      },
      history: history ?? { sessions: 0 },
      historyError,
      sessions: rows,
      totals,
    };
  }

  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: route,
    handler: async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { allow: "GET, HEAD" });
        res.end();
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      const statePath = `${route}/state`;
      const balancePath = `${route}/balance`;
      if (pathname === statePath || pathname === `${statePath}/`) {
        sendJson(res, 200, await buildPayload(false));
        return;
      }
      if (pathname === balancePath || pathname === `${balancePath}/`) {
        sendJson(res, 200, await buildPayload(true));
        return;
      }
      res.writeHead(404, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error: "usage-monitor: unknown path" }));
    },
  }), "usage-monitor: state route");
}
