const { packages } = require("../listPackages");
const path = require('path');
const rimraf = require('rimraf');
for (const packageDir of packages) {
  rimraf.sync(path.join(packageDir, 'lib'));
} 