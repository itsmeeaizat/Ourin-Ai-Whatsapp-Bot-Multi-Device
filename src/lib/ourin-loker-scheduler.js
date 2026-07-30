/**
 * ourin-loker-scheduler.js
 * Scheduler loker otomatis dan helper fetch loker.
 * Sumber: Remotive API + Arbeitnow API (gratis, tanpa API key).
 */

import { CronJob } from "cron";
import { getDatabase } from "./ourin-database.js";
import { logger } from "./ourin-logger.js";
import config from "../../config.js";

const TZ = "Asia/Jakarta";
const DEFAULT_TIMEOUT_MS = 15_000;
const SENT_JOB_TTL_DAYS = 7; // ID loker yang sudah dikirim disimpan selama 7 hari

let sock = null;
let lokerJob = null;

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function getLokerSettings(db) {
  const base = config.lokerScheduler || {};
  const stored = db.setting("lokerScheduler") || {};
  return {
    enabled: stored.enabled ?? base.enabled ?? false,
    timezone: stored.timezone || base.timezone || TZ,
    keywords: Array.isArray(stored.keywords) && stored.keywords.length
      ? stored.keywords
      : (Array.isArray(base.keywords) ? base.keywords : []),
    categories: Array.isArray(stored.categories) && stored.categories.length
      ? stored.categories
      : (Array.isArray(base.categories) ? base.categories : []),
    maxPerBroadcast: Number(stored.maxPerBroadcast || base.maxPerBroadcast || 5),
    schedules: Array.isArray(stored.schedules) && stored.schedules.length
      ? stored.schedules
      : (Array.isArray(base.schedules) ? base.schedules : [
          { key: "pagi", label: "Pagi", hour: 8, minute: 0 },
          { key: "siang", label: "Siang", hour: 13, minute: 0 },
          { key: "malam", label: "Malam", hour: 20, minute: 0 },
        ]),
    sources: Array.isArray(stored.sources) && stored.sources.length
      ? stored.sources
      : (Array.isArray(base.sources) ? base.sources : ["remotive", "arbeitnow"]),
    targets: Array.isArray(stored.targets) ? stored.targets : [],
  };
}

function saveLokerSettings(db, settings) {
  db.setSetting("lokerScheduler", settings);
  return settings;
}

function updateLokerSettings(updater) {
  const db = getDatabase();
  const current = getLokerSettings(db);
  const next = updater(current);
  return saveLokerSettings(db, next);
}

function getLokerStatus() {
  const db = getDatabase();
  return getLokerSettings(db);
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE SENT JOB IDs (dedup)
// ─────────────────────────────────────────────────────────────────────────────

function getSentIds(db) {
  const raw = db.setting("lokerSentIds") || {};
  const now = Date.now();
  const cutoff = now - SENT_JOB_TTL_DAYS * 24 * 60 * 60 * 1000;
  // Buang entri lama
  const cleaned = {};
  for (const [id, ts] of Object.entries(raw)) {
    if (ts > cutoff) cleaned[id] = ts;
  }
  return cleaned;
}

function markSent(db, ids) {
  const current = getSentIds(db);
  const now = Date.now();
  for (const id of ids) current[id] = now;
  db.setSetting("lokerSentIds", current);
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH LOKER
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalize satu job ke struktur standar:
 * { id, title, company, location, type, tags, url, postedAt, salary, source }
 */
function normalizeRemotive(job) {
  return {
    id: `remotive_${job.id}`,
    title: job.title || "-",
    company: job.company_name || "-",
    location: job.candidate_required_location || "Worldwide / Remote",
    type: job.job_type || "Full-time",
    tags: Array.isArray(job.tags) ? job.tags.slice(0, 4) : [],
    url: job.url || "",
    postedAt: job.publication_date || "",
    salary: job.salary || "",
    source: "Remotive",
  };
}

function normalizeArbeitnow(job) {
  return {
    id: `arbeitnow_${job.slug}`,
    title: job.title || "-",
    company: job.company_name || "-",
    location: job.remote ? "Remote" : (job.location || "-"),
    type: job.remote ? "Remote" : "On-site",
    tags: Array.isArray(job.tags) ? job.tags.slice(0, 4) : [],
    url: job.url || "",
    postedAt: job.created_at || "",
    salary: "",
    source: "Arbeitnow",
  };
}

async function fetchRemotive({ keywords = [], categories = [], limit = 20 } = {}) {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (keywords.length) params.set("search", keywords.join(" "));
    if (categories.length) params.set("category", categories[0]);
    const data = await fetchWithTimeout(
      `https://remotive.com/api/remote-jobs?${params}`
    );
    return (data.jobs || []).map(normalizeRemotive);
  } catch (err) {
    logger.warn("LOKER", `Remotive fetch error: ${err.message}`);
    return [];
  }
}

async function fetchArbeitnow({ keywords = [], limit = 20 } = {}) {
  try {
    const data = await fetchWithTimeout(
      "https://www.arbeitnow.com/api/job-board-api?page=1"
    );
    let jobs = (data.data || []).map(normalizeArbeitnow);
    // Filter keyword secara manual karena Arbeitnow tidak support query param search
    if (keywords.length) {
      const kwLower = keywords.map((k) => k.toLowerCase());
      jobs = jobs.filter((j) => {
        const text = `${j.title} ${j.company} ${j.tags.join(" ")}`.toLowerCase();
        return kwLower.some((kw) => text.includes(kw));
      });
    }
    return jobs.slice(0, limit);
  } catch (err) {
    logger.warn("LOKER", `Arbeitnow fetch error: ${err.message}`);
    return [];
  }
}

/**
 * Ambil daftar loker dari semua sumber yang diaktifkan,
 * filter duplikat berdasarkan sentIds, kembalikan max `limit` job.
 */
async function fetchNewJobs({ sources, keywords, categories, limit, sentIds }) {
  const allJobs = [];
  const fetchers = [];

  if (sources.includes("remotive")) {
    fetchers.push(fetchRemotive({ keywords, categories, limit: limit + 20 }));
  }
  if (sources.includes("arbeitnow")) {
    fetchers.push(fetchArbeitnow({ keywords, limit: limit + 20 }));
  }

  const results = await Promise.allSettled(fetchers);
  for (const r of results) {
    if (r.status === "fulfilled") allJobs.push(...r.value);
  }

  // Dedup berdasar ID & filter yang sudah terkirim
  const seen = new Set(Object.keys(sentIds));
  const fresh = [];
  for (const job of allJobs) {
    if (!seen.has(job.id)) {
      seen.add(job.id);
      fresh.push(job);
    }
    if (fresh.length >= limit) break;
  }

  return fresh;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT PESAN
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_EMOJI = {
  "full-time": "🏢",
  "part-time": "⏱️",
  contract: "📋",
  freelance: "🖥️",
  remote: "🌐",
  internship: "🎓",
  "on-site": "📍",
};

function typeEmoji(type = "") {
  const key = type.toLowerCase();
  return TYPE_EMOJI[key] || "💼";
}

function formatJob(job, index) {
  const lines = [
    `*${index}. ${job.title}*`,
    `🏭 ${job.company}`,
    `📍 ${job.location}`,
    `${typeEmoji(job.type)} ${job.type}`,
  ];
  if (job.salary) lines.push(`💰 ${job.salary}`);
  if (job.tags.length) lines.push(`🏷️ ${job.tags.join(", ")}`);
  lines.push(`🔗 ${job.url}`);
  return lines.join("\n");
}

function formatLokerMessage(jobs, { label = "Update", keywords = [], source = "" } = {}) {
  if (!jobs.length) return null;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const date = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const header = [
    "╔══════════════════════╗",
    "  🗂️  *INFO LOWONGAN KERJA*",
    "╚══════════════════════╝",
    "",
    `📅 ${date} | ⏰ ${time} WIB`,
    label ? `🔔 Sesi: *${label}*` : "",
    keywords.length ? `🔍 Kata kunci: _${keywords.join(", ")}_` : "",
    source ? `📡 Sumber: ${source}` : "",
  ].filter(Boolean).join("\n");

  const body = jobs.map((job, i) => formatJob(job, i + 1)).join("\n\n─────────────────────\n\n");

  const footer = [
    "",
    "─────────────────────────",
    `📌 Ditemukan *${jobs.length}* lowongan baru`,
    "💡 Cek manual: _.ayokerja [kata kunci]_",
    "🤖 _Ourin MD — Info Loker Otomatis_",
  ].join("\n");

  return `${header}\n\n${body}${footer}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST
// ─────────────────────────────────────────────────────────────────────────────

async function sendLokerUpdate(scheduleLabel) {
  if (!sock) return;

  const db = getDatabase();
  const settings = getLokerSettings(db);

  if (!settings.enabled) return;
  if (!settings.targets.length) {
    logger.warn("LOKER", "Tidak ada grup target loker");
    return;
  }

  const sentIds = getSentIds(db);
  let jobs;
  try {
    jobs = await fetchNewJobs({
      sources: settings.sources,
      keywords: settings.keywords,
      categories: settings.categories,
      limit: settings.maxPerBroadcast,
      sentIds,
    });
  } catch (err) {
    logger.error("LOKER", `Gagal fetch loker: ${err.message}`);
    return;
  }

  if (!jobs.length) {
    logger.info("LOKER", `[${scheduleLabel}] Tidak ada loker baru untuk dikirim`);
    return;
  }

  const sources = [...new Set(jobs.map((j) => j.source))].join(", ");
  const message = formatLokerMessage(jobs, {
    label: scheduleLabel,
    keywords: settings.keywords,
    source: sources,
  });

  if (!message) return;

  let sent = 0;
  for (const jid of settings.targets) {
    try {
      await sock.sendMessage(jid, { text: message });
      sent++;
    } catch (err) {
      logger.warn("LOKER", `Gagal kirim ke ${jid}: ${err.message}`);
    }
  }

  if (sent > 0) {
    markSent(db, jobs.map((j) => j.id));
    logger.success(
      "LOKER",
      `[${scheduleLabel}] Terkirim ${jobs.length} loker ke ${sent} grup`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

function stopLokerJob() {
  if (lokerJob) {
    lokerJob.stop();
    lokerJob = null;
  }
}

function startLokerJobs(settings) {
  stopLokerJob();
  if (!settings.enabled || !settings.schedules.length) return;

  // Satu CronJob per waktu jadwal
  for (const schedule of settings.schedules) {
    const cron = `0 ${schedule.minute ?? 0} ${schedule.hour} * * *`;
    const label = schedule.label || schedule.key || `${schedule.hour}:00`;
    try {
      const job = new CronJob(
        cron,
        () => sendLokerUpdate(label),
        null,
        true,
        settings.timezone || TZ
      );
      // Simpan semua job (gunakan satu WeakMap agar bisa multi-schedule)
      if (!lokerJob) lokerJob = job;
      logger.info("LOKER", `Jadwal [${label}] → ${cron} (${settings.timezone})`);
    } catch (err) {
      logger.error("LOKER", `Gagal membuat CronJob untuk [${label}]: ${err.message}`);
    }
  }
}

function initLokerScheduler(sockInstance) {
  sock = sockInstance;
  const db = getDatabase();
  const settings = getLokerSettings(db);
  logger.info(
    "LOKER",
    `Scheduler ${settings.enabled ? "aktif" : "nonaktif"} | ${settings.targets.length} grup | ${settings.schedules.length} jadwal`
  );
  startLokerJobs(settings);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  initLokerScheduler,
  getLokerStatus,
  updateLokerSettings,
  fetchNewJobs,
  fetchRemotive,
  fetchArbeitnow,
  formatLokerMessage,
  getSentIds,
  markSent,
  startLokerJobs,
  stopLokerJob,
};
