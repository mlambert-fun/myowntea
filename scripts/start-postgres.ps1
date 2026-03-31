param(
  [string]$DataDir = "",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$Database = "myowntea",
  [string]$Username = "myowntea",
  [string]$Password = "myowntea_dev_pw",
  [int]$StartupTimeoutSeconds = 30,
  [switch]$Foreground
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$defaultDataDir = Join-Path $env:LOCALAPPDATA "MyOwnTea\PostgreSQL\18\data"

if ([string]::IsNullOrWhiteSpace($DataDir)) {
  $dataDir = $defaultDataDir
} elseif ([System.IO.Path]::IsPathRooted($DataDir)) {
  $dataDir = $DataDir
} else {
  $dataDir = Join-Path $repoRoot $DataDir
}

$clusterDir = Split-Path -Parent $dataDir
$logPath = Join-Path $clusterDir "postgres.log"
$pidFile = Join-Path $dataDir "postmaster.pid"
$pgControlPath = Join-Path $dataDir "global\pg_control"

try {
  $Host.UI.RawUI.WindowTitle = "Postgres"
} catch {
}

function Test-PostgresConnection {
  $env:PGPASSWORD = $Password

  try {
    $result = & psql -h $HostName -p $Port -U $Username -d $Database -tAc "select 1" 2>$null
    return ($LASTEXITCODE -eq 0 -and (($result | Out-String).Trim() -eq "1"))
  } catch {
    return $false
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

function Test-ClusterInitialized {
  return (Test-Path $pgControlPath)
}

function Remove-StalePidFile {
  if (-not (Test-Path $pidFile)) {
    return
  }

  $pidLines = Get-Content $pidFile
  if ($pidLines.Count -eq 0) {
    Remove-Item $pidFile -Force
    Write-Host "Removed empty Postgres pid file." -ForegroundColor Yellow
    return
  }

  [int]$existingPid = 0
  if (-not [int]::TryParse($pidLines[0].Trim(), [ref]$existingPid)) {
    return
  }

  try {
    Get-Process -Id $existingPid -ErrorAction Stop | Out-Null
    Write-Host "Postgres pid file already points to active PID $existingPid." -ForegroundColor DarkGray
  } catch {
    Remove-Item $pidFile -Force
    Write-Host "Removed stale Postgres pid file for dead PID $existingPid." -ForegroundColor Yellow
  }
}

function Wait-ForPostgresReady {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-PostgresConnection) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

  return $false
}

if (-not (Test-Path $dataDir)) {
  Write-Error "Postgres data directory not found: $dataDir"
  exit 1
}

if ($dataDir -eq $defaultDataDir) {
  Write-Host "Using local Postgres cluster at $dataDir." -ForegroundColor DarkGray
}

if (Test-PostgresConnection) {
  Write-Host "Postgres is already running on $HostName`:$Port using $dataDir." -ForegroundColor Green
  exit 0
}

Remove-StalePidFile

if (-not (Test-ClusterInitialized)) {
  Write-Error "Postgres cluster is incomplete: missing $pgControlPath"
  Write-Host "No automatic reset was performed." -ForegroundColor Yellow
  Write-Host "Please restore the cluster manually or point the project to a healthy local Postgres instance." -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting Postgres cluster from $dataDir..." -ForegroundColor Cyan
& pg_ctl -D $dataDir -l $logPath start

if ($LASTEXITCODE -ne 0) {
  Write-Error "Unable to start Postgres with pg_ctl."
  exit $LASTEXITCODE
}

if (-not (Wait-ForPostgresReady)) {
  Write-Error "Postgres did not become ready within $StartupTimeoutSeconds seconds."
  if (Test-Path $logPath) {
    Write-Host ""
    Write-Host "Last Postgres log lines:" -ForegroundColor Yellow
    Get-Content $logPath -Tail 30
  }
  exit 1
}

Write-Host "Postgres is ready on $HostName`:$Port." -ForegroundColor Green

if ($Foreground) {
  Write-Host "Postgres is running. Press Ctrl+C in this terminal to stop tailing the log." -ForegroundColor DarkGray
}

if ($Foreground -and (Test-Path $logPath)) {
  Write-Host "Streaming Postgres log output from $logPath..." -ForegroundColor DarkGray
  Get-Content $logPath -Wait
}
