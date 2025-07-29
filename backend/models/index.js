const fs = require('fs');
const path = require('path');

const basename = path.basename(__filename);
const modules = {};

fs.readdirSync(__dirname)
  .filter(file => {
    return (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const moduleName = file.slice(0, -3);
    modules[moduleName] = require(path.join(__dirname, file));
  });

module.exports = modules;