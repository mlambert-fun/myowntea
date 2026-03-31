param(
  [switch]$UseJobs,
  [switch]$ExternalWindows
)

$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-VSCodeTaskUri {
  $taskPayload = [uri]::EscapeDataString('["dev: full stack"]')
  return "vscode://command/workbench.action.tasks.runTask?$taskPayload"
}

function Try-LaunchVsCodeTasks {
  if ($ExternalWindows) {
    return $false
  }

  if ($env:TERM_PROGRAM -ne "vscode") {
    return $false
  }

  try {
    Start-Process (Get-VSCodeTaskUri) | Out-Null
    Write-Host "Opening the VS Code task 'dev: full stack'..." -ForegroundColor Green
    Write-Host "If nothing happens, run 'dev: full stack' from Terminal > Run Task." -ForegroundColor Yellow
    return $true
  } catch {
    Write-Host "Unable to trigger VS Code tasks automatically, falling back to external PowerShell windows." -ForegroundColor Yellow
    return $false
  }
}

function Start-DevScript {
  param(
    [string]$Name,
    [string]$ScriptPath,
    [string[]]$ScriptArguments = @()
  )

  if ($UseJobs) {
    Start-Job -Name $Name -ScriptBlock {
      param($JobName, $RepoRoot, $FilePath, $ScriptArgs)
      Set-Location $RepoRoot
      & powershell -ExecutionPolicy Bypass -File $FilePath @ScriptArgs
    } -ArgumentList $Name, $repoRoot, $ScriptPath, $ScriptArguments | Out-Null
    return
  }

  Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $ScriptPath
  ) + $ScriptArguments | Out-Null
}

if (Try-LaunchVsCodeTasks) {
  return
}

Write-Host "Launching local services in separate PowerShell windows..." -ForegroundColor Green

Start-DevScript -Name "Postgres" -ScriptPath (Join-Path $PSScriptRoot "start-postgres.ps1") -ScriptArguments @("-Foreground")
Start-DevScript -Name "Backend" -ScriptPath (Join-Path $PSScriptRoot "start-backend.ps1")
Start-DevScript -Name "Web" -ScriptPath (Join-Path $PSScriptRoot "start-node-service.ps1") -ScriptArguments @("-Name", "App", "-RelativePath", "app")
Start-DevScript -Name "Admin" -ScriptPath (Join-Path $PSScriptRoot "start-node-service.ps1") -ScriptArguments @("-Name", "Admin", "-RelativePath", "admin")

Write-Host "" 
Write-Host "Local URLs:" -ForegroundColor Green
Write-Host "- Web:   http://localhost:5173" -ForegroundColor White
Write-Host "- Admin: http://localhost:3001" -ForegroundColor White
Write-Host "- API:   http://localhost:5000" -ForegroundColor White
Write-Host "- DB:    localhost:5432" -ForegroundColor White
Write-Host "" 
Write-Host "Tip: from VS Code, prefer the task 'dev: full stack' for one terminal per service." -ForegroundColor DarkGray
