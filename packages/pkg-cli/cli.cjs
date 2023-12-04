const path = require('path');
const fs = require('fs');
const readline = require('readline');
const createUtil = require('./src/create.cjs');
const fileUtil = require('./src/file.cjs');

const args = process.argv.slice(2);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function help() {
  console.log(`USAGE:
    node packages/pkg-cli/index.js create \${PKG_NAME} [-y (yes to all)]
    `);
}

function printHelpAndExit(code = 0) {
  help();
  process.exit(code);
}

function question(q) {
  return new Promise((resolve) => {
    rl.question(`${q} `, resolve);
  });
}

async function questionWithDefaultAnswer(q, defaultA) {
  const a = await question(q);
  if (a === '') return defaultA;
  return a;
}

async function confirm(q) {
  const a = await questionWithDefaultAnswer(`${q} ([Y]/n)`, 'Y');
  return a.toUpperCase() === 'Y';
}

async function create() {
  const pkgName = args[1];
  if (!pkgName) {
    printHelpAndExit();
  }
  const packagesRoot = path.resolve(__dirname, '..');
  const pkgPath = path.resolve(packagesRoot, pkgName);
  if (fs.existsSync(pkgPath)) {
    console.warn(`packages/${pkgName} already exist, abort.`);
    process.exit(-1);
  }

  //#region Options
  const allDefault = args.includes('-y');
  const debug = args.includes('-d');
  let useTs = true;
  let entry = 'src/index.ts';
  let readme = true;

  if (!allDefault) {
    console.clear();
    const confirmed = await confirm(`create package packages/${pkgName}`);
    if (!confirmed) {
      console.log('Canceled');
      process.exit(0);
    }

    useTs = await confirm('use typescript');
    if (!useTs) entry = 'src/index.js';
    entry = await questionWithDefaultAnswer(`entry file (${entry})`, entry);
    readme = await confirm('create README.md');
  }
  //#endregion

  //#region Generate files
  fileUtil.mkdirSync(pkgPath);
  createUtil.createPackageJson(pkgPath, debug);
  if (useTs) {
    createUtil.createTsConfig(pkgPath, debug);
  }
  createUtil.createEntry(pkgPath, entry, debug);
  createUtil.createRollupConfig(pkgPath, useTs, entry, debug);
  if (readme) {
    fileUtil.writeFileSync(path.resolve(pkgPath, 'README.md'), `# ${pkgName}`);
  }
  //#endregion

  console.log(`package created at packages/${pkgName}`);
}

switch (args[0]) {
  case 'create':
    create().then(() => process.exit(0));
    break;
  case 'help':
  case '-h':
  default:
    printHelpAndExit();
    process.exit(0);
    break;
}
