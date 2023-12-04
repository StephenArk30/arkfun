const fs = require('fs');
const path = require('path');

function mkdirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileSync(file, content) {
  mkdirSync(path.dirname(file));
  fs.writeFileSync(file, content);
}

module.exports = {
  mkdirSync,
  writeFileSync,
};
