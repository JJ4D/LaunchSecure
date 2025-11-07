# PowerShell script for GitHub Container Registry authentication
# This must be run on the host machine before docker-compose build/up

Write-Host "=== GitHub Container Registry Authentication Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if GITHUB_TOKEN is already set
if (-not $env:GITHUB_TOKEN) {
    Write-Host "GITHUB_TOKEN environment variable is not set." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To create a GitHub Personal Access Token:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://github.com/settings/tokens"
    Write-Host "2. Click 'Generate new token (classic)'"
    Write-Host "3. Give it a name (e.g., 'LaunchSecure Docker')"
    Write-Host "4. Select the 'read:packages' scope"
    Write-Host "5. Click 'Generate token'"
    Write-Host "6. Copy the token"
    Write-Host ""
    $githubToken = Read-Host "Enter your GitHub Personal Access Token"
    $env:GITHUB_TOKEN = $githubToken
} else {
    $githubToken = $env:GITHUB_TOKEN
}

# Check if GITHUB_USERNAME is set or needs to be entered
if (-not $env:GITHUB_USERNAME) {
    $githubUsername = Read-Host "Enter your GitHub username"
    $env:GITHUB_USERNAME = $githubUsername
} else {
    $githubUsername = $env:GITHUB_USERNAME
}

# Authenticate with GitHub Container Registry
Write-Host ""
Write-Host "Authenticating with GitHub Container Registry (ghcr.io)..." -ForegroundColor Cyan
$githubToken | docker login ghcr.io -u $githubUsername --password-stdin

$authResult = $LASTEXITCODE

if ($authResult -eq 0) {
    Write-Host "Successfully authenticated with GitHub Container Registry" -ForegroundColor Green
    Write-Host ""
    
    # Update .env file if it exists
    $envFileExists = Test-Path .env
    if ($envFileExists) {
        $envLines = Get-Content .env
        $tokenUpdated = $false
        $usernameUpdated = $false
        
        # Update existing lines
        for ($i = 0; $i -lt $envLines.Count; $i++) {
            if ($envLines[$i] -match "^GITHUB_TOKEN=") {
                $envLines[$i] = "GITHUB_TOKEN=$githubToken"
                $tokenUpdated = $true
            }
            if ($envLines[$i] -match "^GITHUB_USERNAME=") {
                $envLines[$i] = "GITHUB_USERNAME=$githubUsername"
                $usernameUpdated = $true
            }
        }
        
        # Add missing entries
        if (-not $tokenUpdated) {
            $envLines += "GITHUB_TOKEN=$githubToken"
        }
        if (-not $usernameUpdated) {
            $envLines += "GITHUB_USERNAME=$githubUsername"
        }
        
        $envLines | Set-Content .env
        Write-Host "Updated .env file with GITHUB_TOKEN and GITHUB_USERNAME" -ForegroundColor Green
    } else {
        Write-Host "Note: .env file not found. Create one and add:" -ForegroundColor Yellow
        Write-Host "  GITHUB_TOKEN=$githubToken"
        Write-Host "  GITHUB_USERNAME=$githubUsername"
    }
    
    Write-Host ""
    Write-Host "You can now run:" -ForegroundColor Green
    Write-Host "  docker-compose build steampipe-powerpipe"
    Write-Host "Or:"
    Write-Host "  docker-compose up steampipe-powerpipe"
} else {
    Write-Host "Authentication failed. Please check your token and try again." -ForegroundColor Red
    exit 1
}
