#!/usr/bin/env node
/**
 * Auto-fix script untuk standardisasi module exports
 * Konversi ke ESM named exports format yang konsisten
 * Usage: node scripts/fix-exports.js [--check]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(color, msg) {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

let filesModified = 0;
let filesChecked = 0;

const exportIssues = [];

/**
 * Fix export statements in a file
 */
function fixExports(filePath) {
  filesChecked++;
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Pattern 1: export default X (should use named export)
    if (content.match(/export\s+default\s+(?!\{)/)) {
      const match = content.match(/export\s+default\s+(\w+)/);
      if (match) {
        // Check if it's a function/class definition
        if (content.includes(`const ${match[1]}`) ||
            content.includes(`function ${match[1]}`) ||
            content.includes(`class ${match[1]}`)) {
          // Keep as is (acceptable)
        }
      }
    }

    // Pattern 2: Multiple named exports should be consistent
    const namedExports = content.match(/export\s+{([^}]+)}/g);
    if (namedExports && namedExports.length > 1) {
      exportIssues.push(`⚠️  ${path.relative(PROJECT_ROOT, filePath)}: Multiple export statements detected`);
    }

    // Pattern 3: export { x as config, y as handler } - GOOD
    // Pattern 4: export default x; export { y } - BAD (mixed)
    if (content.includes('export default') && content.includes('export {')) {
      exportIssues.push(`⚠️  ${path.relative(PROJECT_ROOT, filePath)}: Mixed default and named exports`);
    }

    // Pattern 5: Standardize multi-line exports
    content = content.replace(
      /export\s*\{\s*\n\s*([^}]+?)\s*\n\s*\}/g,
      (match, exports) => {
        const items = exports.split(',').map(s => s.trim()).filter(s => s);
        return `export { ${items.join(', ')} }`;
      }
    );

    if (content !== originalContent) {
      if (!CHECK_ONLY) {
        fs.writeFileSync(filePath, content, 'utf8');
        filesModified++;
        log('green', `✅ Fixed: ${path.relative(PROJECT_ROOT, filePath)}`);
      } else {
        log('yellow', `⚠️  Would fix: ${path.relative(PROJECT_ROOT, filePath)}`);
      }
      return true;
    }
  } catch (err) {
    log('red', `❌ Error processing ${filePath}: ${err.message}`);
  }
  return false;
}

/**
 * Walk directory and fix all JS files
 */
function walkDir(dir) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (file === 'node_modules' || file.startsWith('.')) continue;

    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (file.endsWith('.js')) {
      fixExports(fullPath);
    }
  }
}

// Main
log('cyan', '\n' + '='.repeat(60));
log('cyan', `Export Standardization ${CHECK_ONLY ? '(CHECK ONLY)' : '(FIX MODE)'}`);
log('cyan', '='.repeat(60) + '\n');

walkDir(path.join(PROJECT_ROOT, 'src'));
walkDir(path.join(PROJECT_ROOT, 'plugins'));

log('cyan', '\n' + '='.repeat(60));
log('cyan', 'Summary');
log('cyan', '='.repeat(60) + '\n');

log('cyan', `Files checked: ${filesChecked}`);
log('cyan', `Files ${CHECK_ONLY ? 'would be' : ''} modified: ${filesModified}`);

if (exportIssues.length > 0) {
  log('yellow', `\nPotential issues found:`);
  exportIssues.forEach(issue => console.log('  ' + issue));
}

log('cyan', '\n' + '='.repeat(60) + '\n');

if (!CHECK_ONLY && filesModified > 0) {
  log('green', '✅ Export standardization completed!');
} else if (CHECK_ONLY) {
  log('cyan', 'Run without --check flag to apply fixes');
}

process.exit(0);
