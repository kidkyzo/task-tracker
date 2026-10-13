$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bridgeEntry = Join-Path $repositoryRoot "dist\integrations\mcp\index.js"
$codexExitCode = 1

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  throw "Codex CLI was not found. Install or add it to PATH, then run this script again."
}
if (-not (Test-Path -LiteralPath $bridgeEntry)) {
  throw "The MCP bridge is not built. Run npm run build from the project folder first."
}

$secureToken = Read-Host "AI Task Board agent token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $env:AI_TASK_BOARD_ROOT = $repositoryRoot
  $env:AI_TASK_BOARD_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  Push-Location $repositoryRoot
  try {
    & codex @args
    $codexExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  $env:AI_TASK_BOARD_ROOT = $null
  $env:AI_TASK_BOARD_TOKEN = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  $secureToken.Dispose()
}

exit $codexExitCode
