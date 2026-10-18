import {
  HISTORY_LIMIT,
  HISTORY_PREFIX,
  MONITORS,
  PROBE_TIMEOUT_MS,
  SNAPSHOT_KEY,
  type Monitor,
} from "./monitors.ts";

export type MonitorState = "up" | "down";
export type OverallState = "operational" | "degraded" | "outage" | "unknown";

export type HistorySample = {
  t: number;
  ok: boolean;
  ms: number;
};

export type MonitorStatus = {
  id: string;
  name: string;
  nameEn: string;
  host: string;
  url: string;
  projectId?: string;
  status: MonitorState;
  latencyMs: number | null;
  checkedAt: string;
  uptime24h: number | null;
  uptime7d: number | null;
  samples24h: number;
  samples7d: number;
};

export type StatusSnapshot = {
  ok: boolean;
  studio: "orange-cloud";
  checkedAt: string;
  overall: OverallState;
  uptime24h: number | null;
  uptime7d: number | null;
  up: number;
  down: number;
  monitors: MonitorStatus[];
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function roundPct(up: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((up / total) * 10_000) / 100;
}

function windowStats(
  samples: readonly HistorySample[],
  windowMs: number,
  now: number,
): { uptime: number | null; count: number } {
  const from = now - windowMs;
  let up = 0;
  let total = 0;
  for (const sample of samples) {
    if (sample.t < from) continue;
    total += 1;
    if (sample.ok) up += 1;
  }
  return { uptime: roundPct(up, total), count: total };
}

export function overallFromCounts(up: number, down: number): OverallState {
  if (up + down === 0) return "unknown";
  if (down === 0) return "operational";
  if (up === 0) return "outage";
  return "degraded";
}

export function aggregateUptime(
  monitors: readonly Pick<MonitorStatus, "uptime24h" | "uptime7d" | "samples24h" | "samples7d">[],
): { uptime24h: number | null; uptime7d: number | null } {
  let up24 = 0;
  let total24 = 0;
  let up7 = 0;
  let total7 = 0;

  for (const monitor of monitors) {
    if (monitor.samples24h > 0 && monitor.uptime24h != null) {
      up24 += (monitor.uptime24h / 100) * monitor.samples24h;
      total24 += monitor.samples24h;
    }
    if (monitor.samples7d > 0 && monitor.uptime7d != null) {
      up7 += (monitor.uptime7d / 100) * monitor.samples7d;
      total7 += monitor.samples7d;
    }
  }

  return {
    uptime24h: roundPct(up24, total24),
    uptime7d: roundPct(up7, total7),
  };
}

export async function probeMonitor(
  monitor: Monitor,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(monitor.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "OrangeCloud-Status/1.0 (+https://orangecloud.vn)",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    });
    await response.body?.cancel();
    const ms = Date.now() - started;
    const ok = response.status >= 200 && response.status < 400;
    return { ok, ms };
  } catch {
    return { ok: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function readHistory(kv: KVNamespace, id: string): Promise<HistorySample[]> {
  const raw = await kv.get(`${HISTORY_PREFIX}${id}`, "json");
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is HistorySample =>
      !!item &&
      typeof item === "object" &&
      typeof (item as HistorySample).t === "number" &&
      typeof (item as HistorySample).ok === "boolean" &&
      typeof (item as HistorySample).ms === "number",
  );
}

function appendSample(samples: HistorySample[], sample: HistorySample): HistorySample[] {
  const next = [...samples, sample];
  if (next.length <= HISTORY_LIMIT) return next;
  return next.slice(next.length - HISTORY_LIMIT);
}

export async function runStatusChecks(
  kv: KVNamespace,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<StatusSnapshot> {
  const checkedAt = new Date(now).toISOString();
  const results = await Promise.all(
    MONITORS.map(async (monitor) => {
      const probe = await probeMonitor(monitor, fetchImpl);
      const history = appendSample(await readHistory(kv, monitor.id), {
        t: now,
        ok: probe.ok,
        ms: probe.ms,
      });
      await kv.put(`${HISTORY_PREFIX}${monitor.id}`, JSON.stringify(history));

      const day = windowStats(history, 24 * 60 * 60 * 1000, now);
      const week = windowStats(history, 7 * 24 * 60 * 60 * 1000, now);

      const status: MonitorStatus = {
        id: monitor.id,
        name: monitor.name,
        nameEn: monitor.nameEn,
        host: hostOf(monitor.url),
        url: monitor.url,
        projectId: monitor.projectId,
        status: probe.ok ? "up" : "down",
        latencyMs: probe.ms,
        checkedAt,
        uptime24h: day.uptime,
        uptime7d: week.uptime,
        samples24h: day.count,
        samples7d: week.count,
      };
      return status;
    }),
  );

  const up = results.filter((item) => item.status === "up").length;
  const down = results.length - up;
  const aggregate = aggregateUptime(results);

  const snapshot: StatusSnapshot = {
    ok: down === 0,
    studio: "orange-cloud",
    checkedAt,
    overall: overallFromCounts(up, down),
    uptime24h: aggregate.uptime24h,
    uptime7d: aggregate.uptime7d,
    up,
    down,
    monitors: results,
  };

  await kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export async function readStatusSnapshot(kv: KVNamespace): Promise<StatusSnapshot | null> {
  const raw = await kv.get(SNAPSHOT_KEY, "json");
  if (!raw || typeof raw !== "object") return null;
  return raw as StatusSnapshot;
}

/** Build a snapshot from history alone when a live probe is not desired. */
export async function buildSnapshotFromHistory(
  kv: KVNamespace,
  now = Date.now(),
): Promise<StatusSnapshot | null> {
  const checkedAt = new Date(now).toISOString();
  const monitors: MonitorStatus[] = [];

  for (const monitor of MONITORS) {
    const history = await readHistory(kv, monitor.id);
    if (history.length === 0) continue;
    const latest = history[history.length - 1]!;
    const day = windowStats(history, 24 * 60 * 60 * 1000, now);
    const week = windowStats(history, 7 * 24 * 60 * 60 * 1000, now);
    monitors.push({
      id: monitor.id,
      name: monitor.name,
      nameEn: monitor.nameEn,
      host: hostOf(monitor.url),
      url: monitor.url,
      projectId: monitor.projectId,
      status: latest.ok ? "up" : "down",
      latencyMs: latest.ms,
      checkedAt: new Date(latest.t).toISOString(),
      uptime24h: day.uptime,
      uptime7d: week.uptime,
      samples24h: day.count,
      samples7d: week.count,
    });
  }

  if (monitors.length === 0) return null;

  const up = monitors.filter((item) => item.status === "up").length;
  const down = monitors.length - up;
  const aggregate = aggregateUptime(monitors);

  return {
    ok: down === 0,
    studio: "orange-cloud",
    checkedAt,
    overall: overallFromCounts(up, down),
    uptime24h: aggregate.uptime24h,
    uptime7d: aggregate.uptime7d,
    up,
    down,
    monitors,
  };
}
