const fs = require('fs');
const path = require('path');
const { writeFileSync } = require('./file.cjs');
const cliPkgInfo = require('../package.json');
const packageJsonTemplate = require('../templates/package.template.json');
const tsConfigTemplate = require('../templates/tsconfig.template.json');

function createPackageJson(pkgPath, debug) {
  const packageJson = JSON.stringify(packageJsonTemplate, null, 2).replace(/\$\{name}/g, path.basename(pkgPath));
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    [cliPkgInfo.name]: cliPkgInfo.version,
  };
  if (debug) {
    console.log('\npackage.json:');
    console.log(packageJson);
  }
  writeFileSync(path.resolve(pkgPath, 'package.json'), packageJson);
}

function createTsConfig(pkgPath, debug) {
  const tsConfig = JSON.stringify(tsConfigTemplate, null, 2);
  if (debug) {
    console.log('\ntsconfig.json:');
    console.log(tsConfig);
  }
  writeFileSync(path.resolve(pkgPath, 'tsconfig.json'), tsConfig);
}

function createEntry(pkgPath, entryName, debug) {
  writeFileSync(path.resolve(pkgPath, entryName), '');
  const example = fs.readFileSync(path.resolve(__dirname, '../templates/example.template.ts'), {
    encoding: 'utf-8',
  });
  writeFileSync(path.resolve(pkgPath, 'example', path.basename(entryName)), example);
  if (debug) {
    console.log(`${entryName} created`);
    console.log(`${path.join('example', entryName)} created`);
  }
}

function createRollupConfig(pkgPath, useTs, entry, debug) {
  let configFile = fs.readFileSync(path.resolve(__dirname, '../templates/rollup.template.config.ts'), {
    encoding: 'utf-8',
  });
  configFile = configFile
    .replace(/\$\{useTs}/g, useTs)
    .replace(/\$\{input}/g, entry);
  writeFileSync(path.resolve(pkgPath, 'rollup.config.ts'), configFile);
  if (debug) {
    console.log(`rollup.config.ts: \n${configFile}`);
  }
}

function createRollupDevConfig(pkgPath, entry, debug) {
  let configFile = fs.readFileSync(path.resolve(__dirname, '../templates/rollup.template.dev.config.ts'), {
    encoding: 'utf-8',
  });
  configFile = configFile
    .replace(/\$\{input}/g, path.join('example', entry));
  writeFileSync(path.resolve(pkgPath, 'rollup.dev.config.ts'), configFile);
  if (debug) {
    console.log(`rollup.dev.config.ts: \n${configFile}`);
  }
}

module.exports = {
  createPackageJson,
  createTsConfig,
  createEntry,
  createRollupConfig,
  createRollupDevConfig,
};
