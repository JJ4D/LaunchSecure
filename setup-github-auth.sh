#!/bin/bash
# Setup script for GitHub Container Registry authentication
# This must be run on the host machine before docker-compose build/up

set -e

echo "=== GitHub Container Registry Authentication Setup ==="
echo ""

# Check if GITHUB_TOKEN is already set
if [ -z "$GITHUB_TOKEN" ]; then
  echo "GITHUB_TOKEN environment variable is not set."
  echo ""
  echo "To create a GitHub Personal Access Token:"
  echo "1. Go to: https://github.com/settings/tokens"
  echo "2. Click 'Generate new token (classic)'"
  echo "3. Give it a name (e.g., 'LaunchSecure Docker')"
  echo "4. Select the 'read:packages' scope"
  echo "5. Click 'Generate token'"
  echo "6. Copy the token"
  echo ""
  read -p "Enter your GitHub Personal Access Token: " GITHUB_TOKEN
  echo ""
fi

# Check if GITHUB_USERNAME is set or needs to be entered
if [ -z "$GITHUB_USERNAME" ]; then
  read -p "Enter your GitHub username: " GITHUB_USERNAME
  echo ""
fi

# Authenticate with GitHub Container Registry
echo "Authenticating with GitHub Container Registry (ghcr.io)..."
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin

if [ $? -eq 0 ]; then
  echo "✓ Successfully authenticated with GitHub Container Registry"
  echo ""
  
  # Optionally update .env file
  if [ -f .env ]; then
    if grep -q "^GITHUB_TOKEN=" .env; then
      # Update existing GITHUB_TOKEN
      if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=$GITHUB_TOKEN|" .env
      else
        # Linux
        sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=$GITHUB_TOKEN|" .env
      fi
    else
      # Add GITHUB_TOKEN
      echo "GITHUB_TOKEN=$GITHUB_TOKEN" >> .env
    fi
    
    if grep -q "^GITHUB_USERNAME=" .env; then
      # Update existing GITHUB_USERNAME
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^GITHUB_USERNAME=.*|GITHUB_USERNAME=$GITHUB_USERNAME|" .env
      else
        sed -i "s|^GITHUB_USERNAME=.*|GITHUB_USERNAME=$GITHUB_USERNAME|" .env
      fi
    else
      # Add GITHUB_USERNAME
      echo "GITHUB_USERNAME=$GITHUB_USERNAME" >> .env
    fi
    
    echo "✓ Updated .env file with GITHUB_TOKEN and GITHUB_USERNAME"
  else
    echo "Note: .env file not found. Create one and add:"
    echo "  GITHUB_TOKEN=$GITHUB_TOKEN"
    echo "  GITHUB_USERNAME=$GITHUB_USERNAME"
  fi
  
  echo ""
  echo "You can now run: docker-compose build steampipe-powerpipe"
  echo "Or: docker-compose up steampipe-powerpipe"
else
  echo "✗ Authentication failed. Please check your token and try again."
  exit 1
fi


