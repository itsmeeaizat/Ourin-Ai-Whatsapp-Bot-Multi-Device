import { CronJob } from "cron";
import moment from "moment-timezone";
import config from "../../config.js";
import { getDatabase } from "./ourin-database.js";
import { logger } from "./ourin-logger.js";

const DEFAULT_TIMEOUT_MS = 15_000;
let sock = null;
let refreshJob = null;
const weatherJobs = new Map();

const WEATHER_CODES = {
  0: "Cerah",
  1: "Cerah berawan",
  2: "Berawan sebagian",
  3: "Mendung",
  45: "Berkabut",
  48: "Berkabut tebal",
  51: "Gerimis ringan",
  53: "Gerimis",
  55: "Gerimis lebat",
  56: "Gerimis beku ringan",
  57: "Gerimis beku lebat",
  61: "Hujan ringan",
  63: "Hujan sedang",
  65: "Hujan lebat",
  66: "Hujan beku ringan",
  67: "Hujan beku lebat",
  71: "Salju ringan",
  73: "Salju sedang",
  75: "Salju lebat",
  77: "Butiran salju",
  80: "Hujan lokal ringan",
  81: "Hujan lokal sedang",
  82: "Hujan lokal lebat",
  85: "Salju lokal ringan",
  86: "Salju lokal lebat",
  95: "Badai petir",
  96: "Badai petir dengan hujan es ringan",
  99: "Badai petir dengan hujan es lebat",
};

const WEATHER_SYMBOLS = {
  cerah: "☀️",
  awan: "⛅",
  mendung: "☁️",
  kabut: "🌫️",
  gerimis: "🌦️",
  hujan: "🌧️",
  badai: "⛈️",
  salju: "🌨️",
};

function getWeatherSettings(db) {
  const base = config.weatherScheduler || {};
  const stored = db.setting("weatherScheduler") || {};
  const baseLocation = base.location || {};
  const storedLocation = stored.location || {};
  const defaultSchedules = Array.isArray(base.schedules) ? base.schedules : [];
  const schedules = Array.isArray(stored.schedules) && stored.schedules.length
    ? stored.schedules
    : defaultSchedules;

  return {
    enabled: stored.enabled ?? base.enabled ?? false,
    timezone: stored.timezone || base.timezone || "Asia/Jakarta",
    location: {
      name: storedLocation.name || baseLocation.name || "Jakarta",
      latitude: Number(storedLocation.latitude ?? baseLocation.latitude),
      longitude: Number(storedLocation.longitude ?? baseLocation.longitude),
    },
    schedules,
    targets: Array.isArray(stored.targets) ? stored.targets : [],
    lastSent: stored.lastSent && typeof stored.lastSent === "object"
      ? stored.lastSent
      : {},
  };
}

function saveWeatherSettings(db, settings) {
  db.setting("weatherScheduler", {
    enabled: Boolean(settings.enabled),
    timezone: settings.timezone,
    location: settings.location,
    schedules: settings.schedules,
    targets: settings.targets,
    lastSent: settings.lastSent,
  });
}

function normalizeTarget(jid) {
  if (!jid) return "";
  return String(jid).trim();
}

function getToday(timezone) {
  return moment.tz(timezone).format("YYYY-MM-DD");
}

function formatNumber(value, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 10) / 10}${suffix}` : "-";
}

function symbolForWeather(description) {
  const text = description.toLowerCase();
  if (text.includes("badai")) return WEATHER_SYMBOLS.badai;
  if (text.includes("hujan")) return WEATHER_SYMBOLS.hujan;
  if (text.includes("gerimis")) return WEATHER_SYMBOLS.gerimis;
  if (text.includes("kabut")) return WEATHER_SYMBOLS.kabut;
  if (text.includes("salju")) return WEATHER_SYMBOLS.salju;
  if (text.includes("mendung")) return WEATHER_SYMBOLS.mendung;
  if (text.includes("awan")) return WEATHER_SYMBOLS.awan;
  return WEATHER_SYMBOLS.cerah;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWeather(location, timezone) {
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude)
  ) {
    throw new Error("Koordinat lokasi cuaca tidak valid");
  }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    forecast_days: "1",
    timezone: timezone || "Asia/Jakarta",
  });
  const data = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
  );

  if (!data?.current || !data?.daily) {
    throw new Error("Respons cuaca tidak lengkap");
  }
  return data;
}

function formatWeatherMessage(data, settings, schedule) {
  const current = data.current;
  const currentUnits = data.current_units || {};
  const daily = data.daily;
  const code = Number(current.weather_code);
  const description = WEATHER_CODES[code] || "Kondisi tidak diketahui";
  const dailyDescription =
    WEATHER_CODES[Number(daily.weather_code?.[0])] || description;
  const locationName = settings.location.name || "Lokasi pilihan";
  const unit = currentUnits.temperature_2m || "°C";
  const currentTemperature = formatNumber(
    current.temperature_2m,
    unit === "°C" ? "°C" : ` ${unit}`,
  );
  const feelsLike = formatNumber(
    current.apparent_temperature,
    unit === "°C" ? "°C" : ` ${unit}`,
  );
  const precipitation = formatNumber(current.precipitation, " mm");
  const rainProbability = formatNumber(
    daily.precipitation_probability_max?.[0],
    "%",
  );
  const now = moment.tz(settings.timezone).format("DD/MM/YYYY HH:mm");
  const sunrise = daily.sunrise?.[0]
    ? moment.tz(daily.sunrise[0], settings.timezone).format("HH:mm")
    : "-";
  const sunset = daily.sunset?.[0]
    ? moment.tz(daily.sunset[0], settings.timezone).format("HH:mm")
    : "-";

  return [
    `${symbolForWeather(description)} *Info Cuaca ${schedule.label}*`,
    "",
    `📍 *Lokasi:* ${locationName}`,
    `🕒 *Diperbarui:* ${now} WIB`,
    "",
    `${symbolForWeather(description)} *Sekarang:* ${description}`,
    `🌡️ *Suhu:* ${currentTemperature}`,
    `🤒 *Terasa seperti:* ${feelsLike}`,
    `💧 *Kelembapan:* ${formatNumber(current.relative_humidity_2m, "%")}`,
    `💨 *Angin:* ${formatNumber(current.wind_speed_10m, " km/jam")}`,
    `🌧️ *Curah hujan saat ini:* ${precipitation}`,
    "",
    `📊 *Prakiraan hari ini:* ${dailyDescription}`,
    `🌡️ *Min/Max:* ${formatNumber(daily.temperature_2m_min?.[0], "°C")} / ${formatNumber(daily.temperature_2m_max?.[0], "°C")}`,
    `☔ *Peluang hujan:* ${rainProbability}`,
    `🌅 *Matahari terbit:* ${sunrise} WIB`,
    `🌇 *Matahari terbenam:* ${sunset} WIB`,
    "",
    "_Sumber: Open-Meteo · prakiraan dapat berubah_",
  ].join("\n");
}

async function sendWeatherUpdate(schedule) {
  if (!sock) return;

  const db = getDatabase();
  const settings = getWeatherSettings(db);
  if (!settings.enabled || settings.targets.length === 0) return;

  const date = getToday(settings.timezone);
  const sentKey = `${date}_${schedule.key}`;
  if (settings.lastSent[sentKey]) return;

  try {
    const forecast = await fetchWeather(settings.location, settings.timezone);
    const message = formatWeatherMessage(forecast, settings, schedule);
    let sentCount = 0;

    for (const target of settings.targets) {
      try {
        await sock.sendMessage(target, { text: message });
        sentCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(
          "WeatherScheduler",
          `Gagal mengirim ke ${target}: ${error.message}`,
        );
      }
    }

    if (sentCount > 0) {
      settings.lastSent[sentKey] = new Date().toISOString();
      const oldKeys = Object.keys(settings.lastSent).filter(
        (key) => key.slice(0, 10) < date,
      );
      for (const key of oldKeys) delete settings.lastSent[key];
      saveWeatherSettings(db, settings);
      logger.success(
        "WeatherScheduler",
        `${schedule.label}: laporan cuaca terkirim ke ${sentCount} target`,
      );
    }
  } catch (error) {
    logger.error("WeatherScheduler", `Gagal mengambil cuaca: ${error.message}`);
  }
}

function clearWeatherJobs() {
  for (const job of weatherJobs.values()) job.stop();
  weatherJobs.clear();
}

function buildWeatherJobs() {
  clearWeatherJobs();
  if (!sock) return;

  const db = getDatabase();
  const settings = getWeatherSettings(db);
  if (!settings.enabled || settings.targets.length === 0) {
    logger.info(
      "WeatherScheduler",
      "Menunggu konfigurasi target grup dan aktivasi cuaca",
    );
    return;
  }

  for (const schedule of settings.schedules) {
    const hour = Number(schedule.hour);
    const minute = Number(schedule.minute || 0);
    if (
      !schedule.key ||
      !schedule.label ||
      !Number.isInteger(hour) ||
      hour < 0 ||
      hour > 23 ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    ) {
      continue;
    }

    const job = new CronJob(
      `${minute} ${hour} * * *`,
      () => sendWeatherUpdate(schedule),
      null,
      true,
      settings.timezone,
    );
    weatherJobs.set(schedule.key, job);
  }

  logger.info(
    "WeatherScheduler",
    `${weatherJobs.size} jadwal cuaca aktif (${settings.timezone})`,
  );
}

function initWeatherScheduler(socketInstance) {
  sock = socketInstance;
  if (refreshJob) refreshJob.stop();
  refreshJob = new CronJob(
    "1 0 * * *",
    () => buildWeatherJobs(),
    null,
    true,
    config.weatherScheduler?.timezone || "Asia/Jakarta",
  );
  buildWeatherJobs();
}

function refreshWeatherScheduler() {
  buildWeatherJobs();
}

function stopWeatherScheduler() {
  clearWeatherJobs();
  if (refreshJob) {
    refreshJob.stop();
    refreshJob = null;
  }
  sock = null;
}

async function resolveWeatherLocation(query) {
  const name = String(query || "").trim();
  if (!name) throw new Error("Nama kota kosong");

  const params = new URLSearchParams({
    name,
    count: "1",
    language: "id",
    format: "json",
  });
  const data = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
  );
  const result = data?.results?.[0];
  if (!result) throw new Error(`Kota "${name}" tidak ditemukan`);

  return {
    name: [result.name, result.admin1, result.country]
      .filter(Boolean)
      .join(", "),
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
  };
}

function getWeatherStatus() {
  const db = getDatabase();
  return getWeatherSettings(db);
}

function updateWeatherSettings(updater) {
  const db = getDatabase();
  const settings = getWeatherSettings(db);
  const updated = updater(settings) || settings;
  saveWeatherSettings(db, updated);
  refreshWeatherScheduler();
  return updated;
}

export {
  initWeatherScheduler,
  stopWeatherScheduler,
  refreshWeatherScheduler,
  resolveWeatherLocation,
  getWeatherStatus,
  updateWeatherSettings,
  fetchWeather,
  formatWeatherMessage,
};