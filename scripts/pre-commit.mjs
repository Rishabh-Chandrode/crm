#!/usr/bin/env node

/**
 * Pre-Commit Hook for CRM Monorepo
 * 
 * Enforces:
 * 1. Staged files validation:
 *    - Type Trinity sync (backend types, frontend types, extension types)
 *    - Corresponding test files for modified source code
 *    - Agent / README documentation sync when routes, services, or entities are added
 * 2. Hard TypeScript type checks across all packages (backend, frontend, extension)
 * 3. Automated test suite execution (vitest across all packages)
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(msg = '') {
  console.log(msg);
}

function header(title) {
  log(`\n${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  log(`${colors.cyan}${colors.bright}  ${title}${colors.reset}`);
  log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

function pass(msg) {
  log(`  ${colors.green}✔${colors.reset} ${msg}`);
}

function fail(msg) {
  log(`  ${colors.red}✖${colors.reset} ${colors.red}${msg}${colors.reset}`);
}

function warn(msg) {
  log(`  ${colors.yellow}⚠${colors.reset} ${colors.yellow}${msg}${colors.reset}`);
}

function runCmd(cmd, opts = {}) {
  return execSync(cmd, {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp', NPM_CONFIG_USERCONFIG: '/tmp/.npmrc', VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
    ...opts,
  });
}

let hasErrors = false;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Inspect Staged Files & Verify Synchronization
// ─────────────────────────────────────────────────────────────────────────────
header('STEP 1: Checking Staged Files & Synchronization Rules');

let stagedFiles = [];
try {
  const output = runCmd('git diff --cached --name-only');
  stagedFiles = output.split('\n').map(f => f.trim()).filter(Boolean);
} catch (e) {
  warn('Could not determine staged files via git. Proceeding with global checks.');
}

if (stagedFiles.length === 0) {
  log(`${colors.dim}No files staged in git. Running full workspace checks...${colors.reset}\n`);
} else {
  log(`${colors.dim}Staged files (${stagedFiles.length}):${colors.reset}`);
  stagedFiles.forEach(f => log(`  ${colors.dim}• ${f}${colors.reset}`));
  log('');

  // 1.1 Type Trinity Check
  const TYPE_TRINITY = [
    'packages/backend/src/types/index.ts',
    'packages/frontend/src/lib/types.ts',
    'packages/extension/src/types.ts',
  ];

  const stagedTypes = TYPE_TRINITY.filter(t => stagedFiles.includes(t));
  if (stagedTypes.length > 0 && stagedTypes.length < TYPE_TRINITY.length) {
    const missingTypes = TYPE_TRINITY.filter(t => !stagedFiles.includes(t));
    fail(`Type Trinity out of sync! You modified:\n    ${stagedTypes.join('\n    ')}\n  You MUST also update and stage:\n    ${missingTypes.join('\n    ')}`);
    hasErrors = true;
  } else if (stagedTypes.length === TYPE_TRINITY.length) {
    pass('Type Trinity: All 3 type files are updated in sync.');
  }

  // 1.2 Corresponding Test Files Check
  const packages = [
    { name: 'backend', srcPrefix: 'packages/backend/src/', testPattern: /packages\/backend\/src\/(__tests__\/.*|\.test\.ts$)/ },
    { name: 'frontend', srcPrefix: 'packages/frontend/src/', testPattern: /packages\/frontend\/src\/(__tests__\/.*|\.test\.ts$)/ },
    { name: 'extension', srcPrefix: 'packages/extension/src/', testPattern: /packages\/extension\/src\/(__tests__\/.*|\.test\.ts$)/ },
  ];

  for (const pkg of packages) {
    const pkgSourceFiles = stagedFiles.filter(f => 
      f.startsWith(pkg.srcPrefix) && 
      !pkg.testPattern.test(f) &&
      (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.mjs'))
    );

    const pkgTestFiles = stagedFiles.filter(f => pkg.testPattern.test(f));

    if (pkgSourceFiles.length > 0) {
      if (pkgTestFiles.length === 0) {
        fail(
          `Package '${pkg.name}' has modified source code but NO staged test files!\n` +
          `  Modified sources: ${pkgSourceFiles.slice(0, 3).join(', ')}${pkgSourceFiles.length > 3 ? '...' : ''}\n` +
          `  Rule: Every feature, fix, or handler MUST have automated tests in src/__tests__/`
        );
        hasErrors = true;
      } else {
        pass(`Package '${pkg.name}': Source changes are accompanied by test updates (${pkgTestFiles.length} test files staged).`);
      }
    }
  }

  // 1.3 Documentation & AGENTS.md Sync Check
  const backendRouteOrServiceStaged = stagedFiles.some(f => 
    f.startsWith('packages/backend/src/routes/') || 
    f.startsWith('packages/backend/src/services/') ||
    f.startsWith('packages/backend/src/db/migrate.ts')
  );
  if (backendRouteOrServiceStaged) {
    const docUpdated = stagedFiles.some(f => f === 'packages/backend/README.md' || f === 'packages/backend/AGENTS.md' || f === 'AGENTS.md');
    if (!docUpdated) {
      fail('Backend route/service/schema staged without updating packages/backend/README.md or AGENTS.md');
      hasErrors = true;
    } else {
      pass('Backend docs/AGENTS.md updated in tandem with backend changes.');
    }
  }

  const frontendPageStaged = stagedFiles.some(f => 
    f.startsWith('packages/frontend/src/app/') || 
    f.startsWith('packages/frontend/src/lib/api.ts')
  );
  if (frontendPageStaged) {
    const docUpdated = stagedFiles.some(f => f === 'packages/frontend/README.md' || f === 'packages/frontend/AGENTS.md' || f === 'AGENTS.md');
    if (!docUpdated) {
      fail('Frontend page/API client staged without updating packages/frontend/README.md or AGENTS.md');
      hasErrors = true;
    } else {
      pass('Frontend docs/AGENTS.md updated in tandem with frontend changes.');
    }
  }

  const extensionScriptStaged = stagedFiles.some(f => 
    f.startsWith('packages/extension/src/') && 
    !f.includes('__tests__')
  );
  if (extensionScriptStaged) {
    const docUpdated = stagedFiles.some(f => f === 'packages/extension/README.md' || f === 'packages/extension/AGENTS.md' || f === 'AGENTS.md');
    if (!docUpdated) {
      fail('Extension source staged without updating packages/extension/README.md or AGENTS.md');
      hasErrors = true;
    } else {
      pass('Extension docs/AGENTS.md updated in tandem with extension changes.');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Hard TypeScript Checks (tsc --noEmit)
// ─────────────────────────────────────────────────────────────────────────────
header('STEP 2: Hard TypeScript Checks (tsc --noEmit)');

const typecheckTargets = [
  { name: 'Backend', config: 'packages/backend/tsconfig.json' },
  { name: 'Frontend', config: 'packages/frontend/tsconfig.json' },
  { name: 'Extension', config: 'packages/extension/tsconfig.json' },
];

for (const target of typecheckTargets) {
  try {
    const tscBin = path.resolve('packages/backend/node_modules/typescript/bin/tsc');
    const binPath = fs.existsSync(tscBin) ? `node "${tscBin}"` : 'npx tsc';
    runCmd(`${binPath} --noEmit -p "${target.config}"`);
    pass(`${target.name} TypeScript check passed cleanly (0 errors).`);
  } catch (err) {
    fail(`${target.name} TypeScript check FAILED!`);
    if (err.stdout) log(err.stdout.trim());
    if (err.stderr) log(err.stderr.trim());
    hasErrors = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Automated Test Execution (vitest across all packages)
// ─────────────────────────────────────────────────────────────────────────────
header('STEP 3: Running Automated Test Suites (vitest)');

const testPackages = [
  { name: 'Backend', dir: 'packages/backend' },
  { name: 'Frontend', dir: 'packages/frontend' },
  { name: 'Extension', dir: 'packages/extension' },
];

for (const pkg of testPackages) {
  try {
    const vitestMjs = path.resolve('packages/backend/node_modules/vitest/vitest.mjs');
    const cmd = `node "${vitestMjs}" run`;
    
    const output = runCmd(cmd, { cwd: path.resolve(pkg.dir) });
    pass(`${pkg.name} test suite passed.`);
    const lines = output.split('\n');
    const summary = lines.filter(l => l.includes('Test Files') || l.includes('Tests'));
    if (summary.length > 0) {
      log(`    ${colors.dim}${summary.join(' | ')}${colors.reset}`);
    }
  } catch (err) {
    fail(`${pkg.name} test suite failed.`);
    if (err.stdout) log(err.stdout.trim());
    if (err.stderr) log(err.stderr.trim());
    hasErrors = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL VERDICT
// ─────────────────────────────────────────────────────────────────────────────
log('\n' + '─'.repeat(60));
if (hasErrors) {
  log(`${colors.red}${colors.bright}❌ Pre-commit validation FAILED. Commit aborted.${colors.reset}`);
  log(`${colors.yellow}Please fix the errors above before committing.${colors.reset}\n`);
  process.exit(1);
} else {
  log(`${colors.green}${colors.bright}✅ All pre-commit checks PASSED successfully!${colors.reset}\n`);
  process.exit(0);
}
