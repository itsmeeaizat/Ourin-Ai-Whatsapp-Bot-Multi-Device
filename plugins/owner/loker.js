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
import config from "../../config.js";

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
      "  Aktifkan broadcast loker di grup ini (akan meminta pilihan mode).",
      "",
      `• \`${m.prefix}loker pilih <opsi>\``,
      "  Pilih mode setelah menjalankan `aktif`. Opsi: group | group_channel | private",
      "  Contoh: `.loker pilih group`",
      "",
      `• \`${m.prefix}loker nonaktif\``,
      "  Matikan broadcast loker untuk grup ini.",
      "",
      `• \`${m.prefix}loker kata kunci [kata...]\``,
      "  Set filter kata kunci (pisah spasi).",
      `  Contoh: \`${m.prefix}loker kata kunci developer python\`",
      "",
      `• \`${m.prefix}loker kategori [nama]\``,
      "  Filter berdasarkan kategori Remotive.",
      `  Opsi: ${CATEGORY_OPTIONS.slice(0, 6).join(", ")}, dst.",
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

  // ── AKTIF (menu pilihan mode) ─────────────────────────────────────────
  if (action === "aktif" || action === "on" || action === "enable") {
    if (!m.isGroup) {
      return m.reply("⚠️ Command ini hanya bisa dipakai di dalam grup.");
    }

    // Prompt pilihan mode. Beberapa client/library mungkin mendukung buttons —
    // tapi untuk kompatibilitas, tampilkan opsi yang bisa dipilih via command
    // serta instruksi teks. Owner harus menjalankan `.loker pilih <opsi>`.

    const prompt = [
      "🔧 Pilih mode Loker Otomatis yang ingin diaktifkan:",
      "",
      "1. Buat Grup saja — kirim ke grup ini saja.",
      "   → Ketik: `.loker pilih group`",
      "",
      "2. Grup & Saluran — kirim ke grup ini + saluran (jika disetel).",
      "   → Ketik: `.loker pilih group_channel`",
      "",
      "3. Pesan Privat ke saya — hanya pengaktif yang menerima notifikasi via DM.",
      "   → Ketik: `.loker pilih private`",
      "",
      "Contoh: `.loker pilih group`",
    ].join("\n");

    return m.reply(prompt);
  }

  // ── PILIH MODE setelah prompt ─────────────────────────────────────────
  if (action === "pilih" || action === "mode") {
    const choice = (args[0] || "").toLowerCase();
    const valid = ["group", "group_channel", "groupchannel", "private", "1", "2", "3"];
    if (!valid.includes(choice) && !["group","group_channel","private"].includes(choice)) {
      return m.reply("❌ Opsi tidak dikenali. Gunakan: group | group_channel | private");
    }

    // map numeric shortcuts
    let mode = choice;
    if (choice === "1") mode = "group";
    if (choice === "2") mode = "group_channel";
    if (choice === "3") mode = "private";
    if (choice === "groupchannel") mode = "group_channel";

    const jid = m.chat; // grup tempat perintah dipanggil
    const sender = m.sender; // pengaktif

    // update settings accordingly
    const settings = updateLokerSettings((cur) => {
      const next = { ...cur };
      next.enabled = true;
      const targets = Array.isArray(next.targets) ? [...next.targets] : [];

      if (mode === "group") {
        if (!targets.includes(jid)) targets.push(jid);
      } else if (mode === "group_channel") {
        if (!targets.includes(jid)) targets.push(jid);
        // gunakan saluran dari config jika ada, jika tidak, cukup grup saja
        const channelId = config.saluran?.id || null;
        if (channelId && !targets.includes(channelId)) targets.push(channelId);
      } else if (mode === "private") {
        // gunakan pengaktif sebagai target pribadi
        if (!targets.includes(sender)) targets.push(sender);
        // jika command dijalankan di grup, optional tambah notifikasi di grup bahwa pengaktif memilih private
      }

      next.targets = targets;
      return next;
    });

    startLokerJobs(settings);

    // Reply confirmation
    if (mode === "group") {
      return m.reply(
        `✅ Loker otomatis diaktifkan (mode: Grup). Broadcast akan dikirim ke grup ini (${jid}).\nJadwal: ${formatSchedule(settings.schedules)} WIB`
      );
    }

    if (mode === "group_channel") {
      const channelId = config.saluran?.id || "(tidak disetel)";
      return m.reply(
        `✅ Loker otomatis diaktifkan (mode: Grup & Saluran).\nGrup: ${jid}\nSaluran: ${channelId}\nJadwal: ${formatSchedule(settings.schedules)} WIB`
      );
    }

    if (mode === "private") {
      return m.reply(
        `✅ Loker otomatis diaktifkan (mode: Pesan Privat). Kamu (${sender}) akan menerima notifikasi loker via DM.`
      );
    }
  }

  // ── NONAKTIF ──────────────────────────────────────────────────────────
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

  // ── KATA KUNCI ─────────────────────────────────────────────────────────
  if (action === "kata" || action === "keyword" || action === "filter") {
    // "kata kunci" → args sudah tanpa "kata", cek apakah arg[0] === "kunci"
    if (action === "kata" && args[0]?.toLowerCase() === "kunci") args.shift();
    const keywords = args.filter(Boolean);
    const settings = updateLokerSettings((cur) => ({ ...cur, keywords }));
    return m.reply(
      keywords.length
        ? `✅ Kata kunci loker diset: _${keywords.join(", 