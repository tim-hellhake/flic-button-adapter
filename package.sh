#!/bin/bash -e

if [ -z "${ADDON_ARCH}" ]; then
  echo "ADDON_ARCH must be set in environment"
  exit 1
else
  TARFILE_SUFFIX="-${ADDON_ARCH}"
fi

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

mkdir -p package/fliclib-linux-hci/bin
case "${ADDON_ARCH}" in
  linux-arm)
    cp fliclib-linux-hci/bin/armv6l/flicd package/fliclib-linux-hci/bin
    ;;
  linux-x64)
    cp fliclib-linux-hci/bin/x86_64/flicd package/fliclib-linux-hci/bin
    ;;
  *)
    echo "Unsupported architecture"
    exit 1
esac

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

TARFILE_ARCH="${TARFILE/.tgz/${TARFILE_SUFFIX}.tgz}"
tar czf ${TARFILE_ARCH} package

shasum --algorithm 256 ${TARFILE_ARCH} > ${TARFILE_ARCH}.sha256sum

rm -rf SHA256SUMS package
