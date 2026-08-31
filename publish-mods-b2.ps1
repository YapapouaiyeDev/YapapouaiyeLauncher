#requires -Version 5.1
<#
.SYNOPSIS
  Publie les mods AdoServ67 sur Backblaze B2 (API native).
  La MAJ du launcher reste sur GitHub Releases.

.EXAMPLE
  .\publish-mods-b2.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Get-Content (Join-Path $root ".env") | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process") }
}

$access = $env:B2_MASTER_KEY_ID ; if (-not $access) { $access = $env:B2_KEY_ID }
$secret = $env:B2_MASTER_APP_KEY ; if (-not $secret) { $secret = $env:B2_APP_KEY }
$prefix = $env:B2_MODS_PREFIX ; if (-not $prefix) { $prefix = "" }
if ($prefix -and -not $prefix.EndsWith("/")) { $prefix += "/" }
$bucketId = "771d49577c843ab6ab090414"

if (-not $access -or -not $secret) { Write-Error "B2_MASTER_KEY_ID / B2_MASTER_APP_KEY manquants dans .env" }

$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${access}:${secret}"))
$auth = Invoke-RestMethod -Uri "https://api.backblazeb2.com/b2api/v3/b2_authorize_account" -Headers @{ Authorization = "Basic $pair" } -TimeoutSec 20
$apiUrl = $auth.apiInfo.storageApi.apiUrl
$token = $auth.authorizationToken

function Publish-B2File($name, $bytes, $contentType, $sha1) {
  $upload = Invoke-RestMethod -Uri "$apiUrl/b2api/v3/b2_get_upload_url" -Method Post -Headers @{ Authorization = $token } -Body (@{ bucketId = $bucketId } | ConvertTo-Json) -ContentType "application/json"
  Write-Host "[B2] PUT $name ($([math]::Round($bytes.Length/1KB)) KB)" -ForegroundColor Green
  Invoke-RestMethod -Uri $upload.uploadUrl -Method Post -Headers @{
    Authorization = $upload.authorizationToken
    "X-Bz-File-Name" = [uri]::EscapeDataString($name)
    "Content-Type" = $contentType
    "X-Bz-Content-Sha1" = $sha1
  } -Body $bytes | Out-Null
}

$modsDir = Join-Path $root "mods"
$jars = Get-ChildItem $modsDir -Filter "*.jar" -ErrorAction SilentlyContinue
if (-not $jars) { Write-Error "Aucun .jar dans $modsDir" }

$manifest = @()
foreach ($jar in $jars) {
  $bytes = [System.IO.File]::ReadAllBytes($jar.FullName)
  $sha1 = (Get-FileHash $jar.FullName -Algorithm SHA1).Hash.ToLower()
  Publish-B2File "$prefix$($jar.Name)" $bytes "application/java-archive" $sha1
  $manifest += [ordered]@{ name = $jar.Name; sha = $sha1; size = $jar.Length }
}

$json = ($manifest | ConvertTo-Json -Depth 3)
$jsonBytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
$jsonSha = (New-Object Security.Cryptography.SHA1Managed).ComputeHash($jsonBytes) | ForEach-Object { $_.ToString("x2") }
$jsonSha = -join $jsonSha
Publish-B2File "${prefix}mods.json" $jsonBytes "application/json" $jsonSha

Write-Host ""
Write-Host "[B2] OK ! $($jars.Count) mod(s) publies sur bucket adoserv67" -ForegroundColor Cyan
