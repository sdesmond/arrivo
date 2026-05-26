Write-Host "🤖 Setting up shared AI environments for Windows..." -ForegroundColor Cyan

# Find the project root directory (one level up from this script's directory)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Get-Item (Join-Path $scriptDir "..")).FullName

# Define absolute paths at the project root level
$agentsSkills = Join-Path $rootDir ".agents\skills"
$agentsAgents = Join-Path $rootDir ".agents\agents"
$claudeDir = Join-Path $rootDir ".claude"
$claudeSkills = Join-Path $rootDir ".claude\skills"
$claudeAgents = Join-Path $rootDir ".claude\agents"

# Ensure master source folders exist at the root
New-Item -ItemType Directory -Force -Path $agentsSkills | Out-Null
New-Item -ItemType Directory -Force -Path $agentsAgents | Out-Null
New-Item -ItemType Directory -Force -Path $claudeDir    | Out-Null

# Safely delete old shortcut paths if they exist
if (Test-Path $claudeSkills) { Remove-Item -Recurse -Force $claudeSkills }
if (Test-Path $claudeAgents) { Remove-Item -Recurse -Force $claudeAgents }

# Create native Directory Junctions pointing from .claude up to .agents
New-Item -ItemType Junction -Path $claudeSkills -Value $agentsSkills | Out-Null
New-Item -ItemType Junction -Path $claudeAgents -Value $agentsAgents | Out-Null

Write-Host "Native Junctions successfully mapped at project root!" -ForegroundColor Green
