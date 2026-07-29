import {
  fetchWeather,
  formatWeatherMessage,
  getWeatherStatus,
  resolveWeatherLocation,
} from "../../src/lib/ourin-weather-scheduler.js";

const pluginConfig = {
  name: "cekcuaca",
  alias: ["weathercheck", "cuacasekarang"],
  category: "info",
  description: "Cek informasi cuaca saat ini",
  usage: ".cekcuaca [nama kota]",
  example: ".cekcuaca Bandung",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 0,
  isEnabled: true,
};

async function handler(m) {
  const city = (m.args || []).join(" ").trim();
  await m.react("⏳");

  try {
    const settings = getWeatherStatus();
    const location = city
      ? await resolveWeatherLocation(city)
      : settings.location;
    const forecast = await fetchWeather(location, settings.timezone);
    const message = formatWeatherMessage(
      forecast,
      { ...settings, location },
      { label: "Sekarang" },
    );

    await m.react("✅");
    return m.reply(message);
  } catch (error) {
    await m.react("❌");
    return m.reply(
      [
        "❌ *Gagal mengambil informasi cuaca*",
        "",
        `> ${error.message}`,
        "",
        `Contoh: \`${m.prefix}cekcuaca Jakarta\``,
      ].join("\n"),
    );
  }
}

export { pluginConfig as config, handler };