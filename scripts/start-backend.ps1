param(
  [string]$RelativePath = "backend",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [int]$WaitTimeoutSeconds = 60
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot $RelativePath
$nodeModulesPath = Join-Path $backendPath "node_modules"

try {
  $Host.UI.RawUI.WindowTitle = "Backend"
} catch {
}

function Wait-ForTcpPort {
  param(
    [string]$HostToCheck,
    [int]$PortToCheck,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $client = New-Object System.Net.Sockets.TcpClient

    try {
      $async = $client.BeginConnect($HostToCheck, $PortToCheck, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(1000) -and $client.Connected) {
        $client.EndConnect($async)
        return $true
      }
    } catch {
    } finally {
      $client.Dispose()
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

if (-not (Wait-ForTcpPort -HostToCheck $HostName -PortToCheck $Port -TimeoutSeconds $WaitTimeoutSeconds)) {
  Write-Error "Timed out while waiting for Postgres on $HostName`:$Port."
  exit 1
}

Set-Location $backendPath

if (-not (Test-Path $nodeModulesPath)) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
  & npm install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host "Generating Prisma client..." -ForegroundColor Cyan
& npm run prisma:generate
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Applying Prisma migrations..." -ForegroundColor Cyan
& npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Starting backend dev server..." -ForegroundColor Cyan
& npm run dev
exit $LASTEXITCODE
