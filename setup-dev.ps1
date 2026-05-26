param(
  [ValidateSet("auto", "docker", "local")]
  [string]$Db = "auto"
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $rootDir "scripts/setup-dev.mjs") "--db=$Db"
