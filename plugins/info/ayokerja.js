/**
 * plugins/info/ayokerja.js
 * Command .ayokerja — cek lowongan kerja manual untuk semua user.
 * Sumber: Remotive + Arbeitnow (gratis, tanpa API key).
 */

import {
  fetchNewJobs,
  fetchRemotive,
  fetchArbeitnow,
  formatLokerMessage,
  getLokerStatus,
  getSentIds,
} from "../../src/lib/ourin-loker-scheduler.js";
import { getDatabase } from "../../src/lib/ourin-database.js";

const pluginConfig = {
  name: "ayokerja",
  alias: ["cekloker", "loker", "lowongan", "job"],
  category: "info",
  description: "Cek informasi lowongan kerja terbaru",
  usage: ".ayokerja [kata kunci]",
  example: ".ayokerja developer",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 15,
  energi: 0,
  isEnabled: true,
};

const CATEGORY_MAP = {
  it: "software-dev",
  "software-dev": "software-dev",
  developer: "software-dev",
  dev: "software-dev",
  design: "design",
  desain: "design",
  marketing: "marketing",
  sales: "sales",
  support: "customer-support",
  cs: "customer-support",
  data: "data",
  finance: "finance",
  keuangan: "finance",
  hr: "hr",
  management: "management",
  writing: "writing",
  content: "writing",
  konten: "writing",
  qa: "qa",
  devops: "devops",
  product: "product",
  legal: "legal",
};

function parseArgs(args) {
  const keywords = [];
  let category = "";

  for (const arg of args) {
    const lower = arg.toLowerCase();
    if (CATEGORY_MAP[lower]) {
      category = CATEGORY_MAP[lower];
    } else {
      keywords.push(arg);
    }
  }

  return { keywords, category };
}

async function handler(m) {
  const args = (m.args || []).map((a) => String(a).trim()).filter(Boolean);
  const { keywords, category } = parseArgs(args);

  await m.react("🔍");

  try {
    const settings = getLokerStatus();
    const db = getDatabase();
    const sentIds = getSentIds(db);

    // Merge keyword dari settings + keyword dari user
    const mergedKeywords = keywords.length
      ? keywords
      : settings.keywords;

    const mergedCategories = category
      ? [category]
      : settings.categories;

    const jobs = await fetchNewJobs({
      sources: ["remotive", "arbeitnow"],
      keywords: mergedKeywords,
      categories: mergedCategories,
      limit: 5,
      sentIds: {}, // Cek manual tidak filter sentIds — user mau lihat semua
    });

    if (!jobs.length) {
      await m.react("❌");
      return m.reply(
        [
          "❌ *Lowongan tidak ditemukan*",
          "",
          keywords.length
            ? `Tidak ada loker untuk kata kunci: _${keywords.join(", ")}_`
            : "Tidak ada loker tersedia saat ini.",
          "",
          "Coba kata kunci lain:",
          "`" + m.prefix + "ayokerja developer`",
          "`" + m.prefix + "ayokerja design`",
          "`" + m.prefix + "ayokerja marketing`",
        ].join("\n")
      );
    }

    const sources = [...new Set(jobs.map((j) => j.source))].join(", ");
    const message = formatLokerMessage(jobs, {
      label: keywords.length ? `Pencarian: ${keywords.join(", ")}` : "Loker Terbaru",
      keywords: mergedKeywords,
      source: sources,
    });

    await m.react("✅");
    return m.reply(message);
  } catch (error) {
    await m.react("❌");
    return m.reply(
      [
        "❌ *Gagal mengambil data lowongan*",
        "",
        `> ${error.message}`,
        "",
        `Coba lagi: \`${m.prefix}ayokerja\``,
      ].join("\n")
    );
  }
}

export { pluginConfig as config, handler };
