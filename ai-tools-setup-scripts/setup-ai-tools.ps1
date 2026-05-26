Write-Host "🤖 Setting up shared AI environments for Windows..." -ForegroundColor Cyan

# Ensure script is running with elevated privileges for hardware linking
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "⚠️ Re-run this PowerShell window as an ADMINISTRATOR, or ensuring Developer Mode is active."
}

# Ensure source folders exist
New-Item -ItemType Directory -Force -Path ".agents\skills" | Out-Null
New-Item -ItemType Directory -Force -Path ".agents\agents" | Out-Null
New-Item -ItemType Directory -Force -Path ".claude" | Out-Null

# Remove old folders or broken links safely if they exist
if (Test-Path ".claude\skills") { Remove-Item -Recurve -Force ".claude\skills" }
if (Test-Path ".claude\agents") { Remove-Item -Recurve -Force ".claude\agents" }

# Create native Directory Junctions using absolute paths to eliminate Windows pathing glitches
$currentDir = Get-Location
New-Item -ItemType Junction -Path "$currentDir\.claude\skills" -Value "$currentDir\.agents\skills" | Out-Null
New-Item -ItemType Junction -Path "$currentDir\.claude\agents" -Value "$currentDir\.agents\agents" | Out-Null

Write-Host "Native Junctions successfully mapped!" -ForegroundColor Green
