# LaunchSecure API Testing Script
# PowerShell script for testing API endpoints with automatic authentication

param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$Email = "",
    [string]$Password = "",
    [string]$Token = "",
    [string]$Action = "help",
    [string]$Provider = "",
    [string]$Framework = "",
    [string]$ScanId = "",
    [string]$ClientId = "",
    [string]$Endpoint = ""
)

# Token storage file
$TokenFile = Join-Path $PSScriptRoot ".api-token"

# Function to load stored token
function Get-StoredToken {
    if (Test-Path $TokenFile) {
        return Get-Content $TokenFile -Raw | ConvertFrom-Json
    }
    return $null
}

# Function to save token
function Save-Token {
    param([string]$Token, [object]$User)
    $tokenData = @{
        token = $Token
        user = $User
        saved_at = (Get-Date).ToString("o")
    }
    $tokenData | ConvertTo-Json | Set-Content $TokenFile
}

# Function to login and get token
function Get-AuthToken {
    param(
        [string]$Email,
        [string]$Password,
        [string]$BaseUrl
    )
    
    if (-not $Email -or -not $Password) {
        Write-Host "Error: Email and password required for login" -ForegroundColor Red
        Write-Host "Usage: .\test-api.ps1 -Email 'your@email.com' -Password 'yourpassword'" -ForegroundColor Yellow
        return $null
    }
    
    Write-Host "Logging in as $Email..." -ForegroundColor Cyan
    
    try {
        $body = @{
            email = $Email
            password = $Password
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" `
            -Method Post `
            -Body $body `
            -ContentType "application/json"
        
        if ($response.token) {
            Save-Token -Token $response.token -User $response.user
            Write-Host "Login successful! Token saved." -ForegroundColor Green
            Write-Host "User: $($response.user.email) ($($response.user.role))" -ForegroundColor Green
            return $response.token
        }
    }
    catch {
        Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "Error: $($errorDetails.error)" -ForegroundColor Red
        }
        return $null
    }
}

# Function to get current token (from parameter, stored, or login)
function Get-CurrentToken {
    if ($Token) {
        return $Token
    }
    
    $stored = Get-StoredToken
    if ($stored -and $stored.token) {
        return $stored.token
    }
    
    if ($Email -and $Password) {
        return Get-AuthToken -Email $Email -Password $Password -BaseUrl $BaseUrl
    }
    
    return $null
}

# Function to make authenticated API request
function Invoke-ApiRequest {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [object]$Body = $null,
        [string]$BaseUrl,
        [string]$Token
    )
    
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    
    $uri = "$BaseUrl$Endpoint"
    
    try {
        $params = @{
            Uri = $uri
            Method = $Method
            Headers = $headers
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Host "API Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            try {
                $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
                Write-Host "Error Details: $($errorDetails.error)" -ForegroundColor Red
            }
            catch {
                Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
            }
        }
        throw
    }
}

# Main action handlers
function Show-Help {
    Write-Host @"
LaunchSecure API Testing Script
===============================

Usage:
  .\test-api.ps1 -Action <action> [options]

Actions:
  login           - Login and save token
                    Example: .\test-api.ps1 -Action login -Email admin@example.com -Password secret
  
  benchmarks      - List all available benchmarks (optionally filtered by provider)
                    Example: .\test-api.ps1 -Action benchmarks -Provider aws
  
  benchmark       - Get benchmark details for a specific framework
                    Example: .\test-api.ps1 -Action benchmark -Provider aws -Framework HIPAA
  
  scan            - Get verification report for a scan
                    Example: .\test-api.ps1 -Action scan -ScanId <scan-id>
  
  test-creds      - Test credentials and permissions (Super Admin only)
                    Example: .\test-api.ps1 -Action test-creds -ClientId <client-id> -Provider aws
  
  custom          - Make a custom API request
                    Example: .\test-api.ps1 -Action custom -Endpoint "/api/scans"

Options:
  -BaseUrl        - API base URL (default: http://localhost:3001)
  -Email          - Email for login
  -Password       - Password for login
  -Token          - Use specific token (instead of stored/login)
  -Provider       - Provider filter (aws, azure, gcp)
  -Framework      - Framework name (HIPAA, SOC2, etc.)
  -ScanId         - Scan ID for verification report
  -ClientId       - Client ID for credential testing
  -Endpoint       - Custom endpoint path

Examples:
  # Login first time
  .\test-api.ps1 -Action login -Email admin@example.com -Password secret
  
  # List AWS benchmarks (uses stored token)
  .\test-api.ps1 -Action benchmarks -Provider aws
  
  # Get HIPAA benchmark details
  .\test-api.ps1 -Action benchmark -Provider aws -Framework HIPAA
  
  # Custom endpoint
  .\test-api.ps1 -Action custom -Endpoint "/api/scans"
"@ -ForegroundColor Cyan
}

# Get token first
$currentToken = Get-CurrentToken

if (-not $currentToken -and $Action -ne "login" -and $Action -ne "help") {
    Write-Host "No token found. Please login first:" -ForegroundColor Yellow
    Write-Host "  .\test-api.ps1 -Action login -Email your@email.com -Password yourpassword" -ForegroundColor Yellow
    exit 1
}

# Handle actions
switch ($Action.ToLower()) {
    "help" {
        Show-Help
    }
    
    "login" {
        $token = Get-AuthToken -Email $Email -Password $Password -BaseUrl $BaseUrl
        if ($token) {
            Write-Host "`nToken saved! You can now use other actions without providing credentials." -ForegroundColor Green
        }
    }
    
    "benchmarks" {
        $apiEndpoint = "/api/verification/benchmarks"
        if ($Provider) {
            $apiEndpoint += "?provider=$Provider"
        }
        
        Write-Host "Fetching available benchmarks..." -ForegroundColor Cyan
        $result = Invoke-ApiRequest -Endpoint $apiEndpoint -BaseUrl $BaseUrl -Token $currentToken
        $result | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    
    "benchmark" {
        if (-not $Provider -or -not $Framework) {
            Write-Host "Error: Provider and Framework required" -ForegroundColor Red
            Write-Host "Usage: .\test-api.ps1 -Action benchmark -Provider aws -Framework HIPAA" -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "Fetching benchmark details for $Framework on $Provider..." -ForegroundColor Cyan
        $result = Invoke-ApiRequest -Endpoint "/api/verification/benchmark/$Provider/$Framework" -BaseUrl $BaseUrl -Token $currentToken
        $result | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    
    "scan" {
        if (-not $ScanId) {
            Write-Host "Error: ScanId required" -ForegroundColor Red
            Write-Host "Usage: .\test-api.ps1 -Action scan -ScanId <scan-id>" -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "Fetching verification report for scan $ScanId..." -ForegroundColor Cyan
        $result = Invoke-ApiRequest -Endpoint "/api/verification/scan/$ScanId" -BaseUrl $BaseUrl -Token $currentToken
        $result | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    
    "test-creds" {
        if (-not $ClientId -or -not $Provider) {
            Write-Host "Error: ClientId and Provider required" -ForegroundColor Red
            Write-Host "Usage: .\test-api.ps1 -Action test-creds -ClientId <client-id> -Provider aws" -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "Testing credentials for client $ClientId on $Provider..." -ForegroundColor Cyan
        $body = @{
            client_id = $ClientId
            provider = $Provider
        }
        $result = Invoke-ApiRequest -Endpoint "/api/verification/test-credentials" -Method Post -Body $body -BaseUrl $BaseUrl -Token $currentToken
        $result | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    
    "custom" {
        if (-not $Endpoint) {
            Write-Host "Error: Endpoint required" -ForegroundColor Red
            Write-Host "Usage: .\test-api.ps1 -Action custom -Endpoint '/api/scans'" -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "Making request to $Endpoint..." -ForegroundColor Cyan
        $result = Invoke-ApiRequest -Endpoint $Endpoint -BaseUrl $BaseUrl -Token $currentToken
        $result | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    
    default {
        Write-Host "Unknown action: $Action" -ForegroundColor Red
        Show-Help
        exit 1
    }
}

