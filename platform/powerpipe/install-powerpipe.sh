#!/bin/sh
set -e

if command -v powerpipe >/dev/null 2>&1; then
    echo "Powerpipe already installed: $(powerpipe --version)"
    exit 0
fi

echo "Installing Powerpipe..."

# Use the official installation script from powerpipe.io
# This is the recommended method per https://github.com/turbot/powerpipe
if command -v curl >/dev/null 2>&1; then
    echo "Using official installation script..."
    curl -fsSL https://powerpipe.io/install/powerpipe.sh | bash
    if command -v powerpipe >/dev/null 2>&1; then
        echo "Powerpipe installed successfully via official script"
        powerpipe --version
        exit 0
    fi
fi

# Fallback: Manual installation from GitHub releases
# Latest release is v1.4.1 (per GitHub releases page)
echo "Falling back to manual installation..."
VERSIONS="1.3.0 1.2.0 1.1.0"

for VERSION in $VERSIONS; do
    echo "Trying v${VERSION}..."
    # Correct URL format: powerpipe.linux.amd64.tar.gz (not powerpipe_VERSION_linux_amd64.tar.gz)
    URL="https://github.com/turbot/powerpipe/releases/download/v${VERSION}/powerpipe.linux.amd64.tar.gz"
    
    if ! wget -q -O /tmp/powerpipe.tar.gz "$URL" 2>&1 || [ ! -s /tmp/powerpipe.tar.gz ]; then
        echo "v${VERSION} download failed, trying next..."
        rm -f /tmp/powerpipe.tar.gz
        continue
    fi
    
    if [ -s /tmp/powerpipe.tar.gz ]; then
        echo "Downloaded Powerpipe v${VERSION}"
        tar -xzf /tmp/powerpipe.tar.gz -C /tmp 2>/dev/null || {
            echo "Failed to extract, trying next version..."
            rm -f /tmp/powerpipe.tar.gz
            continue
        }
        
        if [ -f /tmp/powerpipe ]; then
            # Install to user-writable location (container runs as steampipe user)
            mkdir -p /home/steampipe/.local/bin
            mv /tmp/powerpipe /home/steampipe/.local/bin/powerpipe
            chmod +x /home/steampipe/.local/bin/powerpipe
            rm -f /tmp/powerpipe.tar.gz
            # Add to PATH for current session
            export PATH="/home/steampipe/.local/bin:$PATH"
            echo "Powerpipe v${VERSION} installed successfully"
            /home/steampipe/.local/bin/powerpipe --version
            exit 0
        fi
    fi
done

echo "Failed to install Powerpipe - all methods failed"
exit 1

