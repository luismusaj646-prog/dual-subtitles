const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const playwrightCli = path.join(
  projectRoot,
  'node_modules',
  'playwright',
  'cli.js'
);

const result = spawnSync(process.execPath, [
  playwrightCli,
  'test',
  'tests/e2e/real-youtube.spec.js',
  ...process.argv.slice(2)
], {
  cwd: projectRoot,
  env: {
    ...process.env,
    YDS_REAL_YOUTUBE: '1'
  },
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
