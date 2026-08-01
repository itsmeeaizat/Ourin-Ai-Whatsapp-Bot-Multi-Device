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
} from "../../src/lib/ourin-loker-scheduler.js";

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

    // Merge keyword dari settings + keyword dari user
    const mergedKeywords = keywords.length ? keywords : settings.keywords || [];

    const mergedCategories = category ? [category] : settings.categories || [];

    const jobs = await fetchNewJobs({
      sources: ["remotive", "arbeitnow"],
      keywords: mergedKeywords,
      categories: mergedCategories,
      limit: 5,
      sentIds: {}, // Cek manual tidak filter sentIds — user mau lihat semua
    });

    if (!jobs || !jobs.length) {
      await m.react("❌");
      const noMsg = mergedKeywords && mergedKeywords.length
        ? "Tidak ada loker untuk kata kunci: _" + mergedKeywords.join(", ") + "_"
        : "Tidak ada loker terbaru saat ini.";
      const out = ["❌ *Lowongan tidak ditemukan*", "", noMsg].join("\n");
      return m.reply(out);
    }

    const msgs = jobs.map((j) => formatLokerMessage(j)).filter(Boolean).join('\n\n');
    if (!msgs) {
      await m.react("❌");
      return m.reply("ℹ️ Tidak ada loker yang bisa ditampilkan.");
    }

    await m.react("✅");
    return m.reply("📣 Hasil Pencarian:\n\n" + msgs);
  } catch (e) {
    await m.react("⚠️");
    return m.reply(`❌ Terjadi kesalahan: ${e?.message || String(e)}`);
  }
}

export { pluginConfig as config, handler };