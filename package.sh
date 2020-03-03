#!/bin/bash -e

git submodule init
git submodule update

npm install --production
shasum --algorithm 256 manifest.json package.json *.js README.md > SHA256SUMS
find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS

TARFILE=`npm pack`

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
shasum --algorithm 256 LICENSE >> SHA256SUMS
find fliclib-linux-hci -type f -exec shasum --algorithm 256 {} \; >> SHA256SUMS
cd ..

tar czf ${TARFILE} package

shasum --algorithm 256 ${TARFILE} > ${TARFILE}.sha256sum

rm -rf SHA256SUMS package
