/**
 * plugins/owner/loker.js
 * Command .loker — konfigurasi scheduler lowongan kerja otomatis (owner only).
 */

import {
  getLokerStatus,
  updateLokerSettings,
  fetchNewJobs,
  formatLokerMessage,
  getSentIds,
  startLokerJobs,
  stopLokerJob,
} from "../../src/lib/ourin-loker-scheduler.js";
import { getDatabase } from "../../src/lib/ourin-database.js";

const pluginConfig = {
  name: "loker",
  alias: ["setloker", "lokerbot", "infoloker"],
  category: "owner",
  description: "Atur pengiriman info lowongan kerja otomatis ke grup",
  usage: ".loker <aksi>",
  isOwner: true,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 3,
  energi: 0,
  isEnabled: true,
};

const CATEGORY_OPTIONS = [
  "software-dev", "design", "marketing", "sales", "customer-support",
  "data", "finance", "hr", "management", "writing", "qa", "devops",
  "product", "legal",
];

function formatSchedule(schedules) {
  return schedules
    .map(
      (s) =>
        `${s.label || s.key} ${String(s.hour).padStart(2, "0")}:${String(s.minute || 0).padStart(2, "0")}`
    )
    .join(", ");
}

function help(m) {
  return m.reply(
    [
      "*PENGATURAN INFO LOKER OTOMATIS*",
      "",
      `• \`${m.prefix}loker aktif\``,
      "  Aktifkan broadcast loker di grup ini.",
      "",
      `• \`${m.prefix}loker nonaktif\``,
      "  Matikan broadcast loker untuk grup ini.",
      "",
      `• \`${m.prefix}loker kata kunci [kata...]\``,
      "  Set filter kata kunci (pisah spasi).",
      `  Contoh: \`${m.prefix}loker kata kunci developer python\``,
      "",
      `• \`${m.prefix}loker kategori [nama]\``,
      "  Filter berdasarkan kategori Remotive.",
      `  Opsi: ${CATEGORY_OPTIONS.slice(0, 6).join(", ")}, dst.`,
      `  Contoh: \`${m.prefix}loker kategori software-dev\``,
      "",
      `• \`${m.prefix}loker jadwal 08:00 13:00 20:00\``,
      "  Atur jam broadcast (maks 3 waktu).",
      "",
      `• \`${m.prefix}loker jumlah 5\``,
      "  Jumlah loker per broadcast (1–10).",
      "",
      `• \`${m.prefix}loker test\``,
      "  Kirim preview loker sekarang ke chat ini.",
      "",
      `• \`${m.prefix}loker status\``,
      "  Lihat konfigurasi aktif.",
      "",
      `• \`${m.prefix}loker reset\``,
      "  Hapus cache loker yang sudah terkirim.",
      "",
      "Sumber: Remotive + Arbeitnow (gratis, tanpa API key).",
    ].join("\n")
  );
}

function parseTime(value) {
  const match = String(value || "").match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function buildSchedules(args) {
  const labels = ["Pagi", "Siang", "Malam"];
  const keys = ["pagi", "siang", "malam"];
  const times = args.slice(0, 3);
  if (!times.length) return null;
  const result = times.map((v, i) => {
    const t = parseTime(v);
    return t ? { ...t, key: keys[i] || `t${i}`, label: labels[i] || `Waktu ${i + 1}` } : null;
  });
  return result.every(Boolean) ? result : null;
}

async function handler(m) {
  const args = (m.args || []).map((a) => String(a).trim()).filter(Boolean);
  const action = (args.shift() || "help").toLowerCase();

  if (action === "help" || action === "menu") return help(m);

  // ── AKTIF ────────────────────────────────────────────────────────────────
  if (action === "aktif" || action === "on" || action === "enable") {
    if (!m.isGroup) {
      return m.reply("⚠️ Command ini hanya bisa dipakai di dalam grup.");
    }
    const jid = m.chat;
    const settings = updateLokerSettings((cur) => {
      const targets = Array.isArray(cur.targets) ? [...cur.targets] : [];
      if (!targets.includes(jid)) targets.push(jid);
      return { ...cur, enabled: true, targets };
    });
    startLokerJobs(settings);
    return m.reply(
      [
        "✅ *Info loker otomatis DIAKTIFKAN untuk grup ini!*",
        "",
        `Jadwal: ${formatSchedule(settings.schedules)} WIB`,
        `Filter: ${settings.keywords.length ? settings.keywords.join(", ") : "semua kategori"}`,
        `Maks per broadcast: ${settings.maxPerBroadcast} loker`,
        "",
        `Gunakan \`${m.prefix}loker test\` untuk coba sekarang.`,
      ].join("\n")
    );
  }

  // ── NONAKTIF ─────────────────────────────────────────────────────────────
  if (action === "nonaktif" || action === "off" || action === "disable") {
    if (!m.isGroup) {
      return m.reply("⚠️ Command ini hanya bisa dipakai di dalam grup.");
    }
    const jid = m.chat;
    const settings = updateLokerSettings((cur) => {
      const targets = (Array.isArray(cur.targets) ? cur.targets : []).filter(
        (t) => t !== jid
      );
      return { ...cur, targets, enabled: targets.length > 0 };
    });
    if (!settings.targets.length) stopLokerJob();
    return m.reply(
      settings.targets.length
        ? "✅ Broadcast loker dinonaktifkan untuk grup ini."
        : "✅ Broadcast loker dinonaktifkan (tidak ada grup tersisa)."
    );
  }

  // ── KATA KUNCI ────────────────────────────────────────────────────────────
  if (action === "kata" || action === "keyword" || action === "filter") {
    // "kata kunci" → args sudah tanpa "kata", cek apakah arg[0] === "kunci"
    if (action === "kata" && args[0]?.toLowerCase() === "kunci") args.shift();
    const keywords = args.filter(Boolean);
    const settings = updateLokerSettings((cur) => ({ ...cur, keywords }));
    return m.reply(
      keywords.length
        ? `✅ Kata kunci loker diset: _${keywords.join(", ")}_`
        : "✅ Filter kata kunci dihapus (semua loker akan dikirim)."
    );
  }

  // ── KATEGORI ──────────────────────────────────────────────────────────────
  if (action === "kategori" || action === "category") {
    const cat = args[0]?.toLowerCase() || "";
    if (!cat) {
      return m.reply(
        `Kategori tersedia:\n${CATEGORY_OPTIONS.join(", ")}\n\nContoh: \`${m.prefix}loker kategori software-dev\``
      );
    }
    if (!CATEGORY_OPTIONS.includes(cat)) {
      return m.reply(
        `❌ Kategori tidak dikenal: _${cat}_\n\nOpsi: ${CATEGORY_OPTIONS.join(", ")}`
      );
    }
    const settings = updateLokerSettings((cur) => ({ ...cur, categories: [cat] }));
    return m.reply(`✅ Kategori loker diset: _${cat}_`);
  }

  // ── JADWAL ────────────────────────────────────────────────────────────────
  if (action === "jadwal" || action === "schedule" || action === "jam") {
    const schedules = buildSchedules(args);
    if (!schedules) {
      return m.reply(
        `Format salah.\nContoh: \`${m.prefix}loker jadwal 08:00 13:00 20:00\``
      );
    }
    const settings = updateLokerSettings((cur) => ({ ...cur, schedules }));
    startLokerJobs(settings);
    return m.reply(
      `✅ Jadwal loker diperbarui:\n${formatSchedule(schedules)} WIB`
    );
  }

  // ── JUMLAH ────────────────────────────────────────────────────────────────
  if (action === "jumlah" || action === "max" || action === "limit") {
    const n = parseInt(args[0], 10);
    if (isNaN(n) || n < 1 || n > 10) {
      return m.reply(
        `❌ Masukkan angka antara 1–10.\nContoh: \`${m.prefix}loker jumlah 5\``
      );
    }
    updateLokerSettings((cur) => ({ ...cur, maxPerBroadcast: n }));
    return m.reply(`✅ Jumlah loker per broadcast diset: *${n}*`);
  }

  // ── TEST ──────────────────────────────────────────────────────────────────
  if (action === "test" || action === "cek" || action === "preview") {
    await m.react("🔍");
    try {
      const settings = getLokerStatus();
      const db = getDatabase();
      const jobs = await fetchNewJobs({
        sources: settings.sources,
        keywords: settings.keywords,
        categories: settings.categories,
        limit: settings.maxPerBroadcast,
        sentIds: {}, // Preview tidak filter history
      });

      if (!jobs.length) {
        await m.react("❌");
        return m.reply(
          "❌ Tidak ada loker ditemukan.\nCoba ubah kata kunci atau kategori."
        );
      }

      const sources = [...new Set(jobs.map((j) => j.source))].join(", ");
      const message = formatLokerMessage(jobs, {
        label: "Preview / Test",
        keywords: settings.keywords,
        source: sources,
      });

      await m.react("✅");
      return m.reply(message);
    } catch (err) {
      await m.react("❌");
      return m.reply(`❌ Gagal fetch loker: ${err.message}`);
    }
  }

  // ── RESET CACHE ───────────────────────────────────────────────────────────
  if (action === "reset" || action === "clearcache") {
    const db = getDatabase();
    db.setSetting("lokerSentIds", {});
    return m.reply(
      "✅ Cache loker yang sudah terkirim direset.\nBroadcast berikutnya akan mengirim ulang loker terbaru."
    );
  }

  // ── STATUS ────────────────────────────────────────────────────────────────
  if (action === "status" || action === "info") {
    const settings = getLokerStatus();
    const db = getDatabase();
    const sentIds = getSentIds(db);
    return m.reply(
      [
        "*STATUS INFO LOKER OTOMATIS*",
        "",
        `Status     : ${settings.enabled ? "✅ Aktif" : "❌ Nonaktif"}`,
        `Target grup: ${settings.targets.length} grup`,
        `Jadwal     : ${formatSchedule(settings.schedules)} WIB`,
        `Kata kunci : ${settings.keywords.length ? settings.keywords.join(", ") : "semua"}`,
        `Kategori   : ${settings.categories.length ? settings.categories.join(", ") : "semua"}`,
        `Maks/jadwal: ${settings.maxPerBroadcast} loker`,
        `Sumber     : ${settings.sources.join(", ")}`,
        `ID tersimpan: ${Object.keys(sentIds).length} (maks 7 hari)`,
        "",
        "Gunakan `.loker help` untuk panduan.",
      ].join("\n")
    );
  }

  return help(m);
}

export { pluginConfig as config, handler };
