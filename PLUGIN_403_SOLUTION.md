# Steampipe AWS Plugin 403 Error - Solution Options

## Problem
The Steampipe plugin registry (Google Artifact Registry) requires authentication, causing 403 errors when trying to install plugins:

```
GET "https://us-docker.pkg.dev/v2/steampipe/plugins/turbot/aws/manifests/latest": 
response status code 403: denied: Unauthenticated request
```

## Possible Solutions

### Option 1: Use Turbot Pipes Authentication (Recommended)
1. Sign up for Turbot Pipes (free tier available at https://pipes.turbot.com)
2. Get authentication token from Turbot Pipes
3. Set environment variable: `STEAMPIPE_PLUGIN_TOKEN=<your-token>`
4. Retry plugin installation

### Option 2: Manual Plugin Installation
If Turbot provides plugin binaries via GitHub releases or other means:
1. Download plugin binary manually
2. Place in `/home/steampipe/.steampipe/plugins/turbot/aws/`
3. Configure Steampipe to use local plugin

### Option 3: Use Environment Variables Only
Some plugins may work with just environment variables (AWS_ACCESS_KEY_ID, etc.) without explicit installation, but this is unlikely for AWS plugin.

### Option 4: Wait for Registry Access
The registry may become publicly accessible in the future, but there's no timeline.

## Current Status
- Plugin installation fails with 403
- Steampipe service runs without plugin
- Powerpipe mods are installed successfully
- Scans will fail until AWS plugin is available

## Next Steps
1. Check if Turbot Pipes free account provides plugin access
2. Try manual plugin download if available
3. Contact Turbot support for registry access

