const fs = require('fs');
const path = require('path');

function mkdirSync(dir) {
  const paths = dir.split(path.sep);
  for (let i = 1; i <= paths.length; i += 1) {
    const newPath = paths.slice(0, i).join(path.sep);
    try {
      fs.accessSync(newPath, fs.constants.R_OK);
    } catch (e) {
      fs.mkdirSync(newPath);
    }
  }
}

function writeFileSync(file, content) {
  mkdirSync(path.dirname(file));
  fs.writeFileSync(file, content);
}

module.exports = {
  mkdirSync,
  writeFileSync,
};
