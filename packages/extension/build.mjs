import { build, context } from 'esbuild';
import fs from 'fs';

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/popup.ts', 'src/contentScript.ts', 'src/background.ts', 'src/formFiller/index.ts', 'src/authCapture.ts'],
  outdir: 'dist',
  bundle: true,
  target: 'chrome120',
  minify: true,
  define: {
    BACKEND_URL: JSON.stringify(backendUrl),
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log(`Watching… (BACKEND_URL=${backendUrl})`);
} else {
  await build(options);
  console.log(`Built. (BACKEND_URL=${backendUrl})`);
}
