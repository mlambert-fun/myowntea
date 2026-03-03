param(
  [switch]$UseJobs
)

$repoRoot = Split-Path -Parent $PSScriptRoot

function Start-DevServer {
  param(
    [string]$Name,
    [string]$RelativePath,
    [string]$Command
  )

  $fullPath = Join-Path $repoRoot $RelativePath
  $nodeModules = Join-Path $fullPath "node_modules"

  if ($UseJobs) {
    Start-Job -Name $Name -ScriptBlock {
      param($JobName, $Path, $Cmd)
      Set-Location $Path
      if (-not (Test-Path "node_modules")) {
        Write-Host "[$JobName] Installing dependencies..." -ForegroundColor Yellow
        npm install
      }
      Write-Host "[$JobName] Starting dev server..." -ForegroundColor Cyan
      Invoke-Expression $Cmd
    } -ArgumentList $Name, $fullPath, $Command | Out-Null
    return
  }

  $cmd = @(
    "`$Host.UI.RawUI.WindowTitle = '$Name';",
    "Set-Location -Path '$fullPath';",
    "if (-not (Test-Path 'node_modules')) { Write-Host 'Installing dependencies...' -ForegroundColor Yellow; npm install; }",
    "Write-Host 'Starting dev server...' -ForegroundColor Cyan;",
    $Command
  ) -join " "

  Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $cmd | Out-Null
}

Write-Host "Launching local servers..." -ForegroundColor Green

Start-DevServer -Name "Backend" -RelativePath "backend" -Command "npm run dev"
Start-DevServer -Name "Web" -RelativePath "app" -Command "npm run dev"
Start-DevServer -Name "Admin" -RelativePath "admin" -Command "npm run dev"

Write-Host "" 
Write-Host "Local URLs:" -ForegroundColor Green
Write-Host "- Web:   http://localhost:5173" -ForegroundColor White
Write-Host "- Admin: http://localhost:3001" -ForegroundColor White
Write-Host "- API:   http://localhost:5000" -ForegroundColor White
Write-Host "" 
Write-Host "Tip: add -UseJobs to run in the same terminal via jobs." -ForegroundColor DarkGray
