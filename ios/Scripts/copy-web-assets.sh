#!/bin/sh
# Copies the production webapp build into the iOS app bundle's resources.
# Run this (after `npm run build` in webapp/) before `xcodegen generate` +
# building -- mirrors the inline step .github/workflows/mobile-ci.yml and
# signed-mobile-build.yaml already run in CI.
set -e
cd "$(dirname "$0")/.."

rm -rf PCBViewer/Resources/WebAssets
mkdir -p PCBViewer/Resources/WebAssets
cp -r ../webapp/dist/. PCBViewer/Resources/WebAssets/

echo "Copied webapp/dist -> ios/PCBViewer/Resources/WebAssets"
