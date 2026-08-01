*** Begin Patch
*** Update File: plugins/info/ayokerja.js
@@
-    const msgs = jobs.map((j) => formatLokerMessage(j)).filter(Boolean).join('\n\n');
-    if (!msgs) {
-      await m.react("❌");
-      return m.reply("ℹ️ Tidak ada loker yang bisa ditampilkan.");
-    }
-
-    await m.react("✅");
-    return m.reply("📣 Hasil Pencarian:\n\n" + msgs);
+    // formatLokerMessage expects an array of jobs, not a single job per call
+    const msgs = formatLokerMessage(jobs, { keywords: mergedKeywords, source: "" });
+    if (!msgs) {
+      await m.react("❌");
+      return m.reply("ℹ️ Tidak ada loker yang bisa ditampilkan.");
+    }
+
+    await m.react("✅");
+    return m.reply("📣 Hasil Pencarian:\n\n" + msgs);
*** End Patch