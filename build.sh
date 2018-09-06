#!/usr/bin/env bash

rm -rf *.tgz package

TARFILE=$(npm pack)
tar xzf ${TARFILE}
sha256sum package.json *.js LICENSE > package/SHA256SUMS
sha256sum "fliclib-linux-hci/LICENSE (for the flicd binary).txt" >> package/SHA256SUMS
sha256sum "fliclib-linux-hci/COPYING (for the documentation and source code).txt" >> package/SHA256SUMS
sha256sum fliclib-linux-hci/clientlib/nodejs/fliclibNodeJs.js >> package/SHA256SUMS
sha256sum fliclib-linux-hci/bin/*/flicd >> package/SHA256SUMS
mkdir -p package/fliclib-linux-hci/clientlib/nodejs
cp "fliclib-linux-hci/LICENSE (for the flicd binary).txt" package/fliclib-linux-hci
cp "fliclib-linux-hci/COPYING (for the documentation and source code).txt" package/fliclib-linux-hci
cp fliclib-linux-hci/clientlib/nodejs/fliclibNodeJs.js package/fliclib-linux-hci/clientlib/nodejs
cp -r fliclib-linux-hci/bin package/fliclib-linux-hci
tar czf ${TARFILE} package
echo "Created ${TARFILE}"
