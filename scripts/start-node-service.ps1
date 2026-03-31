param(
  [Parameter(Mandatory = $true)]
  [string]$Name,
  [Parameter(Mandatory = $true)]
  [string]$RelativePath,
  [string]$NpmScript = "dev",
  [string]$WaitForHost = "",
  [int]$WaitForPort = 0,
  [int]$WaitTimeoutSeconds = 60
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$servicePath = Join-Path $repoRoot $RelativePath
$nodeModulesPath = Join-Path $servicePath "node_modules"

try {
  $Host.UI.RawUI.WindowTitle = $Name
} catch {
}

function Wait-ForTcpPort {
  param(
    [string]$HostName,
    [int]$PortNumber,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $client = New-Object System.Net.Sockets.TcpClient

    try {
      $async = $client.BeginConnect($HostName, $PortNumber, $null, $null)
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

if (-not (Test-Path $servicePath)) {
  Write-Error "Service path not found: $servicePath"
  exit 1
}

if ($WaitForHost -and $WaitForPort -gt 0) {
  Write-Host "Waiting for $WaitForHost`:$WaitForPort before starting $Name..." -ForegroundColor DarkGray

  if (-not (Wait-ForTcpPort -HostName $WaitForHost -PortNumber $WaitForPort -TimeoutSeconds $WaitTimeoutSeconds)) {
    Write-Error "Timed out while waiting for $WaitForHost`:$WaitForPort."
    exit 1
  }
}

Set-Location $servicePath

if (-not (Test-Path $nodeModulesPath)) {
  Write-Host "Installing dependencies for $Name..." -ForegroundColor Yellow
  & npm install

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host "Starting $Name with npm run $NpmScript..." -ForegroundColor Cyan
& npm run $NpmScript
exit $LASTEXITCODE
