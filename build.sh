#!/usr/bin/env bash

rm -rf *.tgz package/

TARFILE=$(npm pack)
tar xzf ${TARFILE}
echo "" >> package/LICENSE
echo "flicd Linux binaries:" >> package/LICENSE
cat "fliclib-linux-hci/LICENSE (for the flicd binary).txt" >> package/LICENSE
echo "" >> package/LICENSE
echo "flicd node handler base:" >> package/LICENSE
cat "fliclib-linux-hci/COPYING (for the documentation and source code).txt" >> package/LICENSE
cd package
sha256sum LICENSE > SHA256SUMS
cd ..
sha256sum package.json *.js >> package/SHA256SUMS
sha256sum fliclib-linux-hci/clientlib/nodejs/fliclibNodeJs.js >> package/SHA256SUMS
sha256sum fliclib-linux-hci/bin/*/flicd >> package/SHA256SUMS
mkdir -p package/fliclib-linux-hci/clientlib/nodejs
cp fliclib-linux-hci/clientlib/nodejs/fliclibNodeJs.js package/fliclib-linux-hci/clientlib/nodejs
cp -r fliclib-linux-hci/bin package/fliclib-linux-hci
tar czf ${TARFILE} package
echo "Created ${TARFILE}"
