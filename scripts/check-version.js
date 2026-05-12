const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const readmePath = path.join(projectRoot, 'README.md');
const userscriptPath = path.join(projectRoot, 'yt-dual-subs.user.js');
const sourceUserscriptPath = path.join(projectRoot, 'src', 'yt-dual-subs.user.js');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readUserscriptVersion(code) {
  const meta = code.match(/^\s*\/\/\s*@version\s+([^\s]+)/m);
  const runtime = code.match(/\bvar\s+SCRIPT_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return {
    meta: meta && meta[1],
    runtime: runtime && runtime[1]
  };
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const packageVersion = JSON.parse(readFile(packageJsonPath)).version;
const packageLock = JSON.parse(readFile(packageLockPath));
const userscriptVersion = readUserscriptVersion(readFile(userscriptPath));
const sourceUserscriptVersion = fs.existsSync(sourceUserscriptPath)
  ? readUserscriptVersion(readFile(sourceUserscriptPath))
  : {};
const readme = readFile(readmePath);
const readmeVersion = (readme.match(/当前版本：`([^`]+)`/) || [])[1];

const checks = [
  ['package.json version', packageVersion],
  ['package-lock.json version', packageLock.version],
  ['package-lock root package version', packageLock.packages && packageLock.packages[''] && packageLock.packages[''].version],
  ['userscript @version', userscriptVersion.meta],
  ['userscript SCRIPT_VERSION', userscriptVersion.runtime],
  ['source userscript @version', sourceUserscriptVersion.meta],
  ['source userscript SCRIPT_VERSION', sourceUserscriptVersion.runtime],
  ['README current version', readmeVersion]
];

for (const [label, value] of checks) {
  if (!value) fail(`Missing ${label}`);
  else if (value !== packageVersion) fail(`${label} is ${value}, expected ${packageVersion}`);
}

if (!process.exitCode) {
  console.log(`version check passed: ${packageVersion}`);
}
