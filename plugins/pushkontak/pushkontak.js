*** Begin Patch
*** Update File: plugins/pushkontak/pushkontak.js
@@
-    .map((p) => {
-      if (p.phoneNumber) return p.phoneNumber;
-      if (p.jid && !p.jid.endsWith("@lid")) return p.jid;
-      if (p.id && !p.id.endsWith("@lid")) return p.id;
-      const resolved = resolveAnyLidToJid(p.jid || p.id, metadata.participants);
-      if (resolved && !resolved.endsWith("@lid") && !isLidConverted(resolved))
-        return resolved;
-      const cached = getCachedJid(p.jid || p.id || p.lid || "");
-      if (cached && !cached.endsWith("@lid") && !isLidConverted(cached))
-        return cached;
-      return null;
-    })
-    .filter((id) => id && id !== botId && !id.includes(senderJid));
+    .map((p) => {
+      // If only phoneNumber is present, convert to full JID
+      if (p.phoneNumber) {
+        const cleaned = String(p.phoneNumber).replace(/[^0-9]/g, "");
+        if (cleaned) return `${cleaned}@s.whatsapp.net`;
+      }
+      if (p.jid && !p.jid.endsWith("@lid")) return p.jid;
+      if (p.id && !p.id.endsWith("@lid")) return p.id;
+      const resolved = resolveAnyLidToJid(p.jid || p.id, metadata.participants);
+      if (resolved && !resolved.endsWith("@lid") && !isLidConverted(resolved))
+        return resolved;
+      const cached = getCachedJid(p.jid || p.id || p.lid || "");
+      if (cached && !cached.endsWith("@lid") && !isLidConverted(cached))
+        return cached;
+      return null;
+    })
+    .filter((id) => {
+      if (!id) return false;
+      // ensure comparisons are done on full JID strings
+      return id !== botId && id !== senderJid;
+    });
@@
-            limited_time_offer: {
-             text: config.bot?.name || "Ourin-AI",
-             url: "",
-             copy_code: "Push Kontak",
-             expiration_time: Date.now() * 7,
-           },
+            limited_time_offer: {
+              text: config.bot?.name || "Ourin-AI",
+              url: "",
+              copy_code: "Push Kontak",
+              // set expiration to 7 days from now
+              expiration_time: Date.now() + 7 * 24 * 60 * 60 * 1000,
+            },
*** End Patch