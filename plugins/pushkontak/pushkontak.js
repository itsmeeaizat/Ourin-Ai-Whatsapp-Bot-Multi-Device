*** Begin Patch
*** Update File: plugins/pushkontak/pushkontak.js
@@
-  if (cmd === "vcftarget_private")
-    return handleSettingToggle(
-      m,
-      "pushVcfTarget",
-      "VCF Target",
-      "private",
-      "private",
-    );
-  if (cmd === "vcftarget_group")
-    return handleSettingToggle(
-      m,
-      "pushVcfTarget",
-      "VCF Target",
-      "group",
-      "group",
-    );
+  if (cmd === "vcftarget_private") {
+    const db = getDatabase();
+    db.setting("pushVcfTarget", "private");
+    m.react("✅");
+    return m.reply("✅ *VCF TARGET* diset ke: *Private*\n\n> VCF akan dikirim ke chat pribadi owner");
+  }
+  if (cmd === "vcftarget_group") {
+    const db = getDatabase();
+    db.setting("pushVcfTarget", "group");
+    m.react("✅");
+    return m.reply("✅ *VCF TARGET* diset ke: *Group*\n\n> VCF akan dikirim ke chat grup ini");
+  }
*** End Patch