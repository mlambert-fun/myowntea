param(
  [Parameter(Mandatory = $true)]
  [string]$FolderPath
)

$ErrorActionPreference = "Stop"

$resolvedFolder = Resolve-Path -Path $FolderPath -ErrorAction Stop

if (-not (Test-Path -Path $resolvedFolder -PathType Container)) {
  throw "Folder not found: $FolderPath"
}

$sourceFiles = Get-ChildItem -Path $resolvedFolder -File | Where-Object {
  $ext = $_.Extension.ToLowerInvariant()
  $ext -eq ".png" -or $ext -eq ".jpg" -or $ext -eq ".jpeg"
}

foreach ($file in $sourceFiles) {
  $baseName = [IO.Path]::GetFileNameWithoutExtension($file.Name)
  $webpPath = Join-Path $resolvedFolder ("{0}.webp" -f $baseName)

  & npx --yes sharp-cli -i $file.FullName -o $webpPath --format webp --quality 82 | Out-Null

  if ($LASTEXITCODE -eq 0 -and (Test-Path -Path $webpPath -PathType Leaf)) {
    Remove-Item -Force $file.FullName
  }
}
