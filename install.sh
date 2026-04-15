#!/bin/bash
set -euo pipefail

UUID="agents-usage-indicator@github.io"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing $UUID..."

# Compile schemas
echo "  Compiling schemas..."
glib-compile-schemas "$SCRIPT_DIR/schemas/"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Copy files
echo "  Copying files..."
cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"

echo ""
echo "Extension installed to: $INSTALL_DIR"
echo ""
echo "To enable the extension:"
echo "  gnome-extensions enable $UUID"
echo ""
echo "You may need to restart GNOME Shell:"
echo "  On X11:    Alt+F2 → type 'r' → Enter"
echo "  On Wayland: Log out and log back in"
