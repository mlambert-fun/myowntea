$ErrorActionPreference = "Stop"

$baseDir = Get-Location
$mediaDir = Join-Path $baseDir "backend\media\ingredients\vegetal"
$api = "http://localhost:5000"

function Normalize-Name([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ""
  }
  $formD = $value.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $formD.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return ($sb.ToString().ToLower() -replace "[^a-z0-9]+", " ").Trim()
}

$ingredients = Invoke-RestMethod -Uri "$api/api/ingredients" -Method Get
$pngFiles = Get-ChildItem -Path $mediaDir -Filter "*.png" -File
$results = @()

foreach ($file in $pngFiles) {
  $baseName = [IO.Path]::GetFileNameWithoutExtension($file.Name)
  $slug = $baseName -replace '^vegetal[_-]*', ''
  $slug = $slug -replace "[_-]+", " "
  $normalizedSlug = Normalize-Name $slug
  $match = $ingredients | Where-Object { (Normalize-Name $_.name) -eq $normalizedSlug } | Select-Object -First 1

  if (-not $match) {
    $results += [PSCustomObject]@{ file = $file.Name; status = "no-match" }
    continue
  }

  $webpPath = Join-Path $mediaDir ("{0}.webp" -f $baseName)
  npx --yes sharp-cli -i $file.FullName -o $webpPath resize 640 640 --fit cover --format webp --quality 82 | Out-Null

  $publicUrl = "$api/media/ingredients/vegetal/$($baseName).webp"
  $payload = @{
    name = $match.name
    category = $match.category
    basePrice = $match.basePrice
    stock = $match.stock
    description = $match.description
    image = $publicUrl
    color = $match.color
    intensity = $match.intensity
    benefits = $match.benefits
    isActive = $match.isActive
  } | ConvertTo-Json

  Invoke-RestMethod -Uri "$api/api/ingredients/$($match.id)" -Method Put -ContentType "application/json" -Body $payload | Out-Null
  Remove-Item -Force $file.FullName

  $results += [PSCustomObject]@{ file = $file.Name; status = "updated"; ingredient = $match.name }
}

$results | Format-Table -AutoSize
