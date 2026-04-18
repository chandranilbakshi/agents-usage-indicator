#!/bin/bash
set -euo pipefail

UUID="agents-usage-indicator@didmar.github.io"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing $UUID..."

# Compile schemas
echo "  Compiling schemas..."
glib-compile-schemas "$SCRIPT_DIR/schemas/"

# Clean + create install directory
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Copy only runtime files (exclude dev tooling and tests).
echo "  Copying files..."
rsync -a \
    --exclude='node_modules' \
    --exclude='tests' \
    --exclude='.git' \
    --exclude='package.json' \
    --exclude='package-lock.json' \
    --exclude='eslint.config.js' \
    --exclude='*.zip' \
    --exclude='install.sh' \
    --exclude='README.md' \
    --exclude='LICENSE' \
    --exclude='screenshot.png' \
    "$SCRIPT_DIR/" "$INSTALL_DIR/"

echo ""
echo "Extension installed to: $INSTALL_DIR"
echo ""
echo "To enable the extension:"
echo "  gnome-extensions enable $UUID"
echo ""
echo "You may need to restart GNOME Shell:"
echo "  On X11:    Alt+F2 → type 'r' → Enter"
echo "  On Wayland: Log out and log back in"
