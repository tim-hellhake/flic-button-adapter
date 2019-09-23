#!/bin/bash

rm -rf node_modules
npm install --production
rm -rf node_modules/.bin
rm -f SHA256SUMS
sha256sum manifest.json package.json *.js README.md > SHA256SUMS
find node_modules -type f -exec sha256sum {} \; >> SHA256SUMS
TARFILE=$(npm pack)
tar xzf ${TARFILE}
cp -r node_modules ./package
mkdir -p package/fliclib-linux-hci/clientlib/nodejs
cp fliclib-linux-hci/clientlib/nodejs/fliclibNodeJs.js package/fliclib-linux-hci/clientlib/nodejs
cp -r fliclib-linux-hci/bin package/fliclib-linux-hci
echo "" >> package/LICENSE
echo "flicd Linux binaries:" >> package/LICENSE
cat "fliclib-linux-hci/LICENSE (for the flicd binary).txt" >> package/LICENSE
echo "" >> package/LICENSE
echo "flicd node handler base:" >> package/LICENSE
cat "fliclib-linux-hci/COPYING (for the documentation and source code).txt" >> package/LICENSE
cd package
sha256sum LICENSE >> SHA256SUMS
find fliclib-linux-hci -type f -exec sha256sum {} \; >> SHA256SUMS
cd ..
tar czf ${TARFILE} package
rm -rf package
echo "Created ${TARFILE}"
