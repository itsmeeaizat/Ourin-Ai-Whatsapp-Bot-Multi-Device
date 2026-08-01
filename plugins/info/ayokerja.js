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
+    // Prefer using the shared formatter which expects an array.
+    // Wrap in try/catch and provide a safe fallback to avoid crashing workflows.
+    let msgs = null;
+    try {
+      msgs = formatLokerMessage(jobs, { keywords: mergedKeywords, source: "" });
+    } catch (err) {
+      // keep msgs null to trigger fallback
+      msgs = null;
+    }
+
+    if (!msgs) {
+      // fallback: simple formatted list so command still returns useful output
+      msgs = jobs
+        .map((j, i) => `*${i + 1}. ${j.title}*\n🏭 ${j.company}\n📍 ${j.location}\n🔗 ${j.url}`)
+        .join('\n\n');
+    }
+
+    await m.react("✅");
+    return m.reply("📣 Hasil Pencarian:\n\n" + msgs);
*** End Patch