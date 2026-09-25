param(
  [Parameter(Mandatory = $true)]
  [string]$Repository,

  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = 'Stop'
$token = $env:GH_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'GH_TOKEN is required to update the release manifest.'
}

$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent' = 'Undertone updater manifest publisher'
}

$releaseUri = "https://api.github.com/repos/$Repository/releases/tags/$Tag"
$release = Invoke-RestMethod -Method Get -Uri $releaseUri -Headers $headers
$manifestAsset = $release.assets | Where-Object { $_.name -eq 'latest.json' } | Select-Object -First 1
if (-not $manifestAsset) {
  throw "Release $Tag has no latest.json asset."
}

$downloadedManifest = Invoke-WebRequest -Method Get -Uri $manifestAsset.browser_download_url
$manifestText = if ($downloadedManifest.Content -is [byte[]]) {
  [System.Text.Encoding]::UTF8.GetString($downloadedManifest.Content)
} else {
  [string]$downloadedManifest.Content
}
$manifest = $manifestText | ConvertFrom-Json
$changedPlatforms = 0

foreach ($platform in $manifest.platforms.PSObject.Properties) {
  $assetUri = [System.Uri]$platform.Value.url
  if ($assetUri.Host -ne 'api.github.com') {
    continue
  }

  if ($assetUri.AbsolutePath -notmatch '/releases/assets/(\d+)$') {
    throw "Unexpected GitHub updater asset URL for platform $($platform.Name)."
  }

  $assetId = [long]$Matches[1]
  $releaseAsset = $release.assets | Where-Object { [long]$_.id -eq $assetId } | Select-Object -First 1
  if (-not $releaseAsset -or [string]::IsNullOrWhiteSpace($releaseAsset.browser_download_url)) {
    throw "Could not resolve updater asset $assetId in release $Tag."
  }

  $platform.Value.url = $releaseAsset.browser_download_url
  $changedPlatforms++
}

if ($changedPlatforms -eq 0) {
  Write-Host "Updater manifest for $Tag already uses public download URLs."
  exit 0
}

$updatedManifest = $manifest | ConvertTo-Json -Depth 20
$updatedBytes = [System.Text.Encoding]::UTF8.GetBytes($updatedManifest)

Invoke-RestMethod -Method Delete -Uri $manifestAsset.url -Headers $headers | Out-Null
$uploadUri = "https://uploads.github.com/repos/$Repository/releases/$($release.id)/assets?name=latest.json"
$uploadedAsset = Invoke-RestMethod -Method Post -Uri $uploadUri -Headers $headers -ContentType 'application/json' -Body $updatedBytes
if ($uploadedAsset.name -ne 'latest.json') {
  throw "GitHub uploaded an unexpected manifest asset for $Tag."
}

Write-Host "Updated latest.json for $Tag to use public release download URLs ($changedPlatforms platform(s))."
