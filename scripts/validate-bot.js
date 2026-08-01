#!/usr/bin/env node
/**
 * Bot Pre-Check Validation Script
 * Mendeteksi broken imports, missing modules, dan syntax errors sebelum runtime
 * Usage: node scripts/validate-bot.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${COLORS[color]}${args.join(' ')}${COLORS.reset}`);
}

function error(msg) {
  log('red', '❌ ERROR:', msg);
}

function warn(msg) {
  log('yellow', '⚠️  WARN:', msg);
}

function success(msg) {
  log('green', '✅', msg);
}

function info(msg) {
  log('cyan', 'ℹ️ ', msg);
}

// Track all issues
const issues = {
  errors: [],
  warnings: [],
  files_checked: 0,
  exports_issues: [],
};

/**
 * Check if file exists (including node_modules)
 */
function resolveModule(importPath, fromFile) {
  // Absolute paths
  if (importPath.startsWith('/')) {
    return fs.existsSync(importPath);
  }

  // Relative paths
  if (importPath.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFile), importPath + '.js');
    const resDir = path.resolve(path.dirname(fromFile), importPath);
    return fs.existsSync(resolved) || fs.existsSync(resDir);
  }

  // Node modules / third party
  try {
    require.resolve(importPath, { paths: [PROJECT_ROOT] });
    return true;
  } catch {
    const nodeModulesPath = path.join(PROJECT_ROOT, 'node_modules', importPath);
    return fs.existsSync(nodeModulesPath);
  }
}

/**
 * Extract imports/exports from JS file
 */
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = [];
    const exports = [];
    const lines = content.split('\n');

    // Regex patterns
    const importPattern = /import\s+(?:{([^}]*)}|([\w*]+)|([\w*]+)\s+from|\*\s+as\s+(\w+)\s+from)\s+['"]([^'"]+)['"];?/g;
    const exportPattern = /export\s+(?:default|{([^}]*)})\s+(?:from\s+['"]([^'"]+)['"])?;?/g;
    const namedExportPattern = /export\s+(?:const|function|class|async\s+function)\s+(\w+)/g;

    let match;
    while ((match = importPattern.exec(content)) !== null) {
      imports.push({
        module: match[5],
        raw: match[0],
      });
    }

    while ((match = exportPattern.exec(content)) !== null) {
      exports.push({
        type: 'named',
        names: match[1] ? match[1].split(',').map(s => s.trim()) : [],
        from: match[2] || '',
      });
    }

    if (content.includes('export default')) {
      exports.push({ type: 'default' });
    }

    while ((match = namedExportPattern.exec(content)) !== null) {
      exports.push({ type: 'named', name: match[1] });
    }

    return { imports, exports, lines };
  } catch (err) {
    error(`Failed to analyze ${filePath}: ${err.message}`);
    return { imports: [], exports: [], lines: [] };
  }
}

/**
 * Check for broken imports
 */
function checkImports(filePath) {
  const { imports } = analyzeFile(filePath);
  const fileIssues = [];

  for (const imp of imports) {
    if (!resolveModule(imp.module, filePath)) {
      const issue = `❌ ${filePath}: Cannot find module "${imp.module}"`;
      fileIssues.push(issue);
      issues.errors.push(issue);
    }
  }

  return fileIssues;
}

/**
 * Check for export consistency
 */
function checkExports(filePath) {
  const { exports } = analyzeFile(filePath);
  const fileIssues = [];

  if (exports.length === 0) {
    warn(`${path.relative(PROJECT_ROOT, filePath)}: No exports found`);
    return fileIssues;
  }

  // Check for mixed export patterns
  const hasDefault = exports.some(e => e.type === 'default');
  const hasNamed = exports.some(e => e.type === 'named');

  if (hasDefault && hasNamed) {
    const issue = `⚠️  ${filePath}: Mixed default and named exports (may cause compatibility issues)`;
    fileIssues.push(issue);
    issues.warnings.push(issue);
  }

  return fileIssues;
}

/**
 * Walk directory and check all JS files
 */
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (file === 'node_modules' || file.startsWith('.')) continue;

    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (file.endsWith('.js')) {
      callback(fullPath);
    }
  }
}

/**
 * Main validation
 */
async function validate() {
  log('cyan', '\n' + '='.repeat(60));
  log('cyan', 'Bot Pre-Check Validation');
  log('cyan', '='.repeat(60) + '\n');

  info('Checking source files in src/ and plugins/');
  info('This may take a moment...\n');

  const dirsToCheck = [
    path.join(PROJECT_ROOT, 'src'),
    path.join(PROJECT_ROOT, 'plugins'),
  ];

  for (const dir of dirsToCheck) {
    walkDir(dir, (file) => {
      issues.files_checked++;
      checkImports(file);
      checkExports(file);
    });
  }

  // Print results
  log('cyan', '\n' + '='.repeat(60));
  log('cyan', 'Validation Results');
  log('cyan', '='.repeat(60) + '\n');

  success(`Files checked: ${issues.files_checked}`);

  if (issues.errors.length > 0) {
    log('red', `\nFound ${issues.errors.length} ERRORS:`);
    issues.errors.forEach(e => console.log('  ' + e));
  }

  if (issues.warnings.length > 0) {
    log('yellow', `\nFound ${issues.warnings.length} WARNINGS:`);
    issues.warnings.forEach(w => console.log('  ' + w));
  }

  if (issues.errors.length === 0 && issues.warnings.length === 0) {
    success('\n🎉 All checks passed!');
    log('cyan', '\n' + '='.repeat(60) + '\n');
    process.exit(0);
  }

  log('cyan', '\n' + '='.repeat(60) + '\n');

  if (issues.errors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

validate().catch((err) => {
  error('Validation failed:', err.message);
  process.exit(1);
});
