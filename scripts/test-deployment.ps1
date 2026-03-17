# Deployment Test Script Wrapper (PowerShell)
# Simple wrapper for the comprehensive deployment test script

param(
    [string[]]$Arguments = @()
)

# Colors for output
$Colors = @{
    Red = "`e[31m"
    Green = "`e[32m"
    Yellow = "`e[33m"
    Blue = "`e[34m"
    Reset = "`e[0m"
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "Reset"
    )
    Write-Host "$($Colors[$Color])$Message$($Colors.Reset)"
}

Write-ColorOutput "🚀 Reverse Proxy Deployment Test" "Blue"
Write-ColorOutput "==================================" "Blue"
Write-Host ""

# Check prerequisites
Write-ColorOutput "📋 Checking Prerequisites" "Blue"

# Check if Node.js is available
try {
    $null = Get-Command node -ErrorAction Stop
    Write-ColorOutput "✅ Node.js is available" "Green"
} catch {
    Write-ColorOutput "❌ Node.js is not installed" "Red"
    exit 1
}

# Check if Docker is available
try {
    $null = Get-Command docker -ErrorAction Stop
    Write-ColorOutput "✅ Docker is available" "Green"
} catch {
    Write-ColorOutput "❌ Docker is not installed" "Red"
    exit 1
}

# Check if Docker Compose is available
try {
    $null = Get-Command docker-compose -ErrorAction Stop
    Write-ColorOutput "✅ Docker Compose is available" "Green"
} catch {
    Write-ColorOutput "❌ Docker Compose is not installed" "Red"
    exit 1
}

# Check if Docker daemon is running
try {
    docker info | Out-Null
    Write-ColorOutput "✅ Docker daemon is running" "Green"
} catch {
    Write-ColorOutput "❌ Docker daemon is not running" "Red"
    exit 1
}

# Check required files
Write-Host ""
Write-ColorOutput "📁 Checking Required Files" "Blue"

$requiredFiles = @(
    "docker-compose.prod.yml",
    "docker-compose.dev.yml",
    "nginx/nginx.conf",
    "nginx/conf.d/default.conf",
    "Dockerfile.frontend"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-ColorOutput "✅ $file" "Green"
    } else {
        Write-ColorOutput "❌ $file is missing" "Red"
        exit 1
    }
}

Write-Host ""
Write-ColorOutput "🧪 Running Comprehensive Deployment Tests" "Blue"
Write-Host ""

# Run the main test script
try {
    if ($Arguments.Count -gt 0) {
        & node scripts/test-deployment.cjs @Arguments
    } else {
        & node scripts/test-deployment.cjs
    }
} catch {
    Write-ColorOutput "❌ Test execution failed: $($_.Exception.Message)" "Red"
    exit 1
}