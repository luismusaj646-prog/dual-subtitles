const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'src', 'yt-dual-subs.user.js');
const outputPath = path.join(projectRoot, 'yt-dual-subs.user.js');
const checkOnly = process.argv.includes('--check');

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Source userscript not found: ${sourcePath}`);
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, 'utf8');

if (checkOnly) {
  const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (normalize(source) !== normalize(output)) {
    console.error('Generated userscript is out of date. Run `npm run build`.');
    process.exit(1);
  }
  console.log('build check passed: yt-dual-subs.user.js is up to date');
} else {
  fs.copyFileSync(sourcePath, outputPath);
  console.log(`built ${path.relative(projectRoot, outputPath)} from ${path.relative(projectRoot, sourcePath)}`);
}
