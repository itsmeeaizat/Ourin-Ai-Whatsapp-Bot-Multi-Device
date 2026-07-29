import {
  fetchWeather,
  formatWeatherMessage,
  getWeatherStatus,
  resolveWeatherLocation,
  updateWeatherSettings,
} from "../../src/lib/ourin-weather-scheduler.js";

const pluginConfig = {
  name: "cuaca",
  alias: ["weather", "infocuaca"],
  category: "owner",
  description: "Atur laporan cuaca otomatis pagi, sore, dan malam",
  usage: ".cuaca <aksi>",
  isOwner: true,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 3,
  energi: 0,
  isEnabled: true,
};

function formatSchedule(schedule) {
  return schedule
    .map(
      (item) =>
        `${item.label} ${String(item.hour).padStart(2, "0")}:${String(item.minute || 0).padStart(2, "0")}`,
    )
    .join(", ");
}

function help(m) {
  return m.reply(
    [
      "*PENGATURAN CUACA OTOMATIS*",
      "",
      `• \`${m.prefix}cuaca lokasi Jakarta\``,
      "  Atur kota yang dipakai untuk laporan.",
      "",
      `• \`${m.prefix}cuaca aktif\``,
      "  Aktifkan di grup tempat command ini dikirim.",
      "",
      `• \`${m.prefix}cuaca nonaktif\``,
      "  Matikan laporan untuk grup ini.",
      "",
      `• \`${m.prefix}cuaca jadwal 07:00 15:00 20:00\``,
      "  Atur jam pagi, sore, dan malam.",
      "",
      `• \`${m.prefix}cuaca test\``,
      "  Kirim preview cuaca sekarang ke chat ini.",
      "",
      `• \`${m.prefix}cuaca status\``,
      "  Lihat konfigurasi aktif.",
      "",
      "API: Open-Meteo, gratis dan tanpa API key.",
    ].join("\n"),
  );
}

function parseTime(value) {
  const match = String(value || "").match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function getScheduleFromArgs(args) {
  const input = args.length ? args : ["07:00", "15:00", "20:00"];
  if (input.length !== 3) return null;
  const labels = ["Pagi", "Sore", "Malam"];
  const keys = ["pagi", "sore", "malam"];
  const schedules = input.map((value, index) => {
    const parsed = parseTime(value);
    return parsed
      ? { ...parsed, key: keys[index], label: labels[index] }
      : null;
  });
  return schedules.every(Boolean) ? schedules : null;
}

async function handler(m) {
  const args = (m.args || []).map((arg) => String(arg).trim()).filter(Boolean);
  const action = (args.shift() || "help").toLowerCase();

  if (action === "help" || action === "menu") return help(m);

  if (action === "lokasi" || action === "kota") {
    const city = args.join(" ").trim();
    if (!city) return m.reply(`Contoh: \`${m.prefix}cuaca lokasi Bandung\``);

    await m.react("⏳");
    try {
      const location = await resolveWeatherLocation(city);
      const settings = updateWeatherSettings((current) => ({
        ...current,
        location,
      }));
      await m.react("✅");
      return m.reply(
        [
          "*LOKASI CUACA DIPERBARUI*",
          "",
          `📍 ${settings.location.name}`,
          `🌐 ${settings.location.latitude}, ${settings.location.longitude}`,
          "",
          "Laporan akan memakai lokasi ini pada jadwal berikut:",
          formatSchedule(settings.schedules),
        ].join("\n"),
      );
    } catch (error) {
      await m.react("❌");
      return m.reply(`❌ Gagal mencari lokasi: ${error.message}`);
    }
  }

  if (action === "jadwal" || action === "schedule") {
    const schedules = getScheduleFromArgs(args);
    if (!schedules) {
      return m.reply(
        `Format salah.\nContoh: \`${m.prefix}cuaca jadwal 07:00 15:00 20:00\``,
      );
    }
    const settings = updateWeatherSettings((current) => ({
      ...current,
      schedules,
    }));
    return m.reply(
      `✅ Jadwal cuaca diperbarui:\n${formatSchedule(settings.schedules)} WIB`,
    );
  }

  if (action === "aktif" || action === "on" || action === "enable") {
    if (!m.isGroup) {
      return m.reply(
        `Kirim command ini di grup tujuan.\nContoh: \`${m.prefix}cuaca aktif\``,
      );
    }
    const settings = updateWeatherSettings((current) => ({
      ...current,
      enabled: true,
      targets: [...new Set([...current.targets, m.chat])],
    }));
    return m.reply(
      [
        "✅ *CUACA OTOMATIS AKTIF*",
        "",
        `📍 ${settings.location.name}`,
        `🕒 ${formatSchedule(settings.schedules)} WIB`,
        "",
        "Laporan akan dikirim ke grup ini setiap hari.",
      ].join("\n"),
    );
  }

  if (action === "nonaktif" || action === "off" || action === "disable") {
    if (!m.isGroup) {
      return m.reply(`Kirim command ini di grup tujuan untuk menonaktifkannya.`);
    }
    const settings = updateWeatherSettings((current) => {
      const targets = current.targets.filter((target) => target !== m.chat);
      return {
        ...current,
        enabled: targets.length > 0,
        targets,
      };
    });
    return m.reply(
      settings.targets.length
        ? "✅ Laporan cuaca dinonaktifkan untuk grup ini."
        : "✅ Laporan cuaca dinonaktifkan karena tidak ada grup tujuan.",
    );
  }

  if (action === "test" || action === "cek") {
    await m.react("⏳");
    try {
      const settings = getWeatherStatus();
      const forecast = await fetchWeather(
        settings.location,
        settings.timezone,
      );
      const schedule = { label: "Sekarang" };
      await m.react("✅");
      return m.reply(formatWeatherMessage(forecast, settings, schedule));
    } catch (error) {
      await m.react("❌");
      return m.reply(`❌ Gagal mengambil data cuaca: ${error.message}`);
    }
  }

  if (action === "status") {
    const settings = getWeatherStatus();
    return m.reply(
      [
        "*STATUS CUACA OTOMATIS*",
        "",
        `Status: ${settings.enabled ? "Aktif" : "Nonaktif"}`,
        `Lokasi: ${settings.location.name}`,
        `Zona waktu: ${settings.timezone}`,
        `Jadwal: ${formatSchedule(settings.schedules)} WIB`,
        `Target: ${settings.targets.length} grup`,
        "",
        "Gunakan `.cuaca help` untuk bantuan.",
      ].join("\n"),
    );
  }

  return help(m);
}

export { pluginConfig as config, handler };