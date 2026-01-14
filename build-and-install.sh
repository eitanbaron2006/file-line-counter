#!/bin/bash
# Build and Install Script for File Line Counter Extension
# Usage: ./build-and-install.sh [patch|minor|major]

set -e

# Default version bump type
BUMP_TYPE=${1:-patch}

echo "🔧 File Line Counter - Build & Install Script"
echo "=============================================="

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📌 Current version: $CURRENT_VERSION"

# Calculate new version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $BUMP_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "❌ Invalid bump type: $BUMP_TYPE (use: patch, minor, or major)"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "📦 New version: $NEW_VERSION"

# Update package.json with new version
echo "📝 Updating package.json..."
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    echo "📥 Installing vsce..."
    npm install -g @vscode/vsce
fi

# Package the extension
echo "📦 Packaging extension..."
vsce package --no-dependencies --allow-missing-repository

VSIX_FILE="file-line-counter-$NEW_VERSION.vsix"

echo ""
echo "✅ Build complete! VSIX file created: $VSIX_FILE"
echo ""
echo "� To install, run one of these commands:"
echo "   code --install-extension $VSIX_FILE --force"
echo ""
echo "   Or in VS Code: Ctrl+Shift+P → 'Install from VSIX' → select $VSIX_FILE"
echo ""
echo "💡 Then run 'Developer: Reload Window' to apply changes."
