export type Monitor = {
  id: string;
  name: string;
  nameEn: string;
  url: string;
  /** Anchor on the homepage when the domain maps to a project row. */
  projectId?: string;
};

/** Public Orange Cloud hosts shown on the status bar. */
export const MONITORS: readonly Monitor[] = [
  {
    id: "home",
    name: "Orange Cloud",
    nameEn: "Orange Cloud",
    url: "https://orangecloud.vn/",
  },
  {
    id: "blog",
    name: "Insights",
    nameEn: "Insights",
    url: "https://blog.orangecloud.vn/",
  },
  {
    id: "onboarding",
    name: "Onboarding",
    nameEn: "Onboarding",
    url: "https://onboarding.orangecloud.vn/",
    projectId: "onboarding",
  },
  {
    id: "ready",
    name: "CF Ready",
    nameEn: "CF Ready",
    url: "https://ready.orangecloud.vn/",
    projectId: "ready",
  },
  {
    id: "launch",
    name: "OCLaunch",
    nameEn: "OCLaunch",
    url: "https://launch.orangecloud.vn/",
    projectId: "launch",
  },
  {
    id: "hrm",
    name: "HR Platform",
    nameEn: "HR Platform",
    url: "https://hrm.orangecloud.vn/",
    projectId: "hr",
  },
  {
    id: "bhxh",
    name: "BHXH HR",
    nameEn: "BHXH HR",
    url: "https://bhxh.orangecloud.vn/",
    projectId: "bhxh",
  },
  {
    id: "reputation",
    name: "PulseWatch",
    nameEn: "PulseWatch",
    url: "https://reputation.orangecloud.vn/",
    projectId: "pulse",
  },
  {
    id: "wcstat",
    name: "PitchIntel",
    nameEn: "PitchIntel",
    url: "https://wcstat.orangecloud.vn/",
    projectId: "pitch",
  },
  {
    id: "poker",
    name: "Poker Faces",
    nameEn: "Poker Faces",
    url: "https://poker.orangecloud.vn/",
    projectId: "poker",
  },
] as const;

export const SNAPSHOT_KEY = "status:snapshot";
export const HISTORY_PREFIX = "status:history:";

/** Keep ~7 days at a 5-minute cron interval. */
export const HISTORY_LIMIT = 2016;

/** Probe timeout for each host. */
export const PROBE_TIMEOUT_MS = 8_000;
