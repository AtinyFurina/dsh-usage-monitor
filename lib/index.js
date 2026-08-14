// @deepseek-ai/dsh-usage-monitor — host half.
// Cordis plugin for the DeepSeek Harness Web profile. Registers a small JSON
// HTTP route under /usage-monitor that serves:
//   - per-session token usage (provider-reported buckets + live pressure)
//   - cross-session totals and a rough cost estimate
//   - the DeepSeek platform balance (GET /user/balance), cached with a TTL
// The bundled client half (dist/client.js, dsh.client = platform "web")
// polls this route and renders a floating panel inside the Web GUI.

import { credentialRef } from "@deepseek-ai/dsh-credentials";
import z from "@deepseek-ai/schemastery";

export const name = "usage-monitor";
export const inject = ["webServer", "sessions"];

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
  // Cost table in CNY per 1M tokens. The FIRST row is used for the cost /
  // remaining-token estimates (the session wire payload does not carry the
  // routed model). Keep the real numbers in sync with the official pricing
  // page: https://api-docs.deepseek.com/quick_start/pricing
  prices: z.array(z.object({
    model: z.string().required(),
    input: z.number().default(2),
    cacheRead: z.number().default(0.5),
    output: z.number().default(8),
  })).default([
    { model: "deepseek-chat", input: 2, cacheRead: 0.5, output: 8 },
    { model: "deepseek-reasoner", input: 4, cacheRead: 1, output: 16 },
  ]),
});

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function sendJson(res, status, payload) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

/** Cost estimate in CNY from a provider usage bucket using one price row. */
function costOf(usage, price) {
  if (!usage || !price) return null;
  const input = Number(usage.uncachedInputTokens ?? usage.inputTokens ?? 0);
  const cacheRead = Number(usage.cacheReadTokens ?? 0);
  const output = Number(usage.outputTokens ?? 0);
  return (input * price.input + cacheRead * price.cacheRead + output * price.output) / 1e6;
}

/** Remaining-token estimate from a remaining balance at the input price. */
function remainingTokensFrom(balance, price) {
  if (balance === null || balance === undefined || !price) return null;
  return Number(balance) / (Number(price.input) / 1e6);
}

export function apply(ctx, config) {
  const route = config.route.endsWith("/") ? config.route.slice(0, -1) : config.route;

  // Balance cache. lastError survives between fetches so the panel can show
  // a stale balance together with the freshest failure reason.
  let balance = null;
  let balanceFetchedAt = 0;
  let balanceError = null;
  let balanceInFlight = null;

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

  function sessionPayload() {
    const sessions = ctx.sessions.list();
    const tokenMeter = ctx.get("tokenMeter");
    const projections = ctx.get("sessionProjections");
    const defaultPrice = config.prices[0];

    const rows = [];
    const totals = {
      totalTokens: 0,
      surfaceTokens: 0,
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      costCny: 0,
    };

    for (const session of sessions) {
      const row = {
        id: String(session.id),
        title: undefined,
        totalTokens: null,
        surfaceTokens: null,
        usage: null,
        pressure: null,
        costCny: null,
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
        const cost = costOf(row.usage, defaultPrice);
        row.costCny = cost === null ? null : Math.round(cost * 1e4) / 1e4;
        totals.uncachedInputTokens += row.usage.uncachedInputTokens;
        totals.cacheReadTokens += row.usage.cacheReadTokens;
        totals.cacheWriteTokens += row.usage.cacheWriteTokens;
        totals.outputTokens += row.usage.outputTokens;
        if (cost !== null) totals.costCny += cost;
      }
      if (row.totalTokens !== null) totals.totalTokens += row.totalTokens;
      if (row.surfaceTokens !== null) totals.surfaceTokens += row.surfaceTokens;
      rows.push(row);
    }

    totals.costCny = Math.round(totals.costCny * 1e4) / 1e4;
    return { rows, totals };
  }

  async function buildPayload(forceBalance) {
    await refreshBalance(forceBalance);
    const { rows, totals } = sessionPayload();
    const defaultPrice = config.prices[0];
    const balanceValue = balance === null
      ? null
      : { ...balance, fetchedAt: balanceFetchedAt };
    return {
      ok: true,
      now: Date.now(),
      balance: balanceValue,
      balanceError: balance === null ? balanceError : (balanceError ?? null),
      remainingTokensEstimate: balanceValue === null
        ? null
        : Math.round(remainingTokensFrom(balanceValue.totalBalance, defaultPrice) ?? 0),
      prices: config.prices,
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
