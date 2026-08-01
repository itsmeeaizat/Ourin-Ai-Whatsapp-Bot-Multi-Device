# Bot Validation & Testing Guide

## Pre-Check Scripts

Sebelum menjalankan bot, pastikan semua module dan exports sudah benar:

### 1. Validate Module Integrity
```bash
npm run validate
```

**Apa yang dicek:**
- ✅ Broken imports (module yang tidak ada)
- ✅ Missing dependencies
- ✅ Export consistency issues
- ✅ Syntax errors dalam import statements

**Output:**
- `✅ All checks passed!` - Aman untuk dijalankan
- `❌ ERROR: ...` - Ada module yang hilang, harus diperbaiki
- `⚠️  WARN: ...` - Compatibility issue, sebaiknya diperbaiki

### 2. Check Export Consistency
```bash
npm run check-exports
```

**Apa yang dicek:**
- Mixed default dan named exports dalam satu file
- Multi-line export formatting
- Export statement consistency

**Output:**
- `⚠️  Would fix: ...` - File yang perlu perbaikan
- Tidak ada output = semua baik

### 3. Auto-Fix Export Issues
```bash
npm run fix-exports
```

**Apa yang dilakukan:**
- Format ulang multi-line exports
- Standardisasi export statements
- Log setiap file yang dimodifikasi

## Workflow

### Before Running Bot
```bash
# 1. Install dependencies
npm install

# 2. Validate everything
npm run validate

# 3. Fix any export issues
npm run fix-exports

# 4. Double-check
npm run check-exports

# 5. Start bot
npm start
```

## ESLint Auto-Fix Workflow

Workflow GitHub Actions akan:

1. **Setiap push ke `main`:**
   - Run ESLint --fix pada `src/` dan `plugins/`
   - **TIDAK upload `node_modules/`** (dikecualikan)
   - Simpan reports di `/reports/` (GitHub Artifacts)
   - Buat PR dengan code fixes

2. **Branch ESLint PR:**
   - Naming: `eslint-fix-auto/{run_id}`
   - Kecil (< 1MB, tanpa node_modules)
   - Auto-delete setelah merge

3. **Reports:**
   - Tersimpan sebagai artifact di Actions UI
   - Accessible untuk 30 hari
   - Format: JSON + Text

## Module Export Standards

### ✅ RECOMMENDED (Konsisten)
```javascript
// Option 1: Named export
export { handler, pluginConfig as config };

// Option 2: Default + Named hybrid
export { handler as default };
export { pluginConfig as config };

// Option 3: ESM style
export const handler = async (m, { sock }) => { ... };
export const config = { ... };
```

### ❌ NOT RECOMMENDED (Tidak Konsisten)
```javascript
// Mixed patterns dalam satu file
export default handler;
export { pluginConfig as config };

// Bare default
export default likee;  // (jika tidak ada named)
```

## Report Files

Setelah workflow berjalan:

```
/reports/
├── eslint-report.json    # Detailed format
├── eslint-report.txt     # Human-readable
└── ESLINT_SUMMARY.md     # Summary report
```

Download dari GitHub Actions → Artifacts → eslint-reports

## Troubleshooting

### Error: Module "X" not found
```bash
# 1. Install dependencies
npm install

# 2. Check if module exists
npm list X

# 3. Re-run validation
npm run validate
```

### Error: Mixed default and named exports
```bash
# Run fix-exports untuk auto-fix
npm run fix-exports
```

### Workflow failed - file size too large
- ✅ Already fixed! Workflow now excludes node_modules
- Reports go to Artifacts (no size limit)
- Only code changes committed to branch

## Important Files

- `.github/workflows/github_workflows_EslintAutoFix.yaml` - Main workflow
- `scripts/validate-bot.js` - Pre-check script
- `scripts/fix-exports.js` - Export standardization
- `.gitignore` - Prevent node_modules commit

---

**Last Updated:** 2026-08-01
**Maintained By:** Copilot Assistant
