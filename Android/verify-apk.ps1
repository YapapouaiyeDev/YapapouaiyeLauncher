param(
    [Parameter(Mandatory)][string]$Apk,
    [Parameter(Mandatory)][string]$SdkDirectory,
    [ValidateSet('arm64', 'x86_64')][string]$Architecture = 'arm64'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$buildTools = Get-ChildItem -LiteralPath (Join-Path $SdkDirectory 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
& (Join-Path $buildTools.FullName 'apksigner.bat') verify --verbose $Apk
if ($LASTEXITCODE -ne 0) { throw 'Signature APK invalide.' }
$badging = (& (Join-Path $buildTools.FullName 'aapt.exe') dump badging $Apk) -join "`n"
if ($LASTEXITCODE -ne 0 -or $badging -notmatch "package: name='fr.yapapouaiye.launcher.android.debug'") { throw 'Identité Android inattendue.' }
$androidVersion = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json
$expectedVersion = $androidVersion.version
if ($badging -notmatch ("versionName='" + [Regex]::Escape($expectedVersion) + "'")) { throw 'Version Android non synchronisée.' }
if ($badging -notmatch ("versionCode='" + $androidVersion.versionCode + "'")) { throw 'Code de version Android non synchronisé.' }
$abi = if ($Architecture -eq 'arm64') { 'arm64-v8a' } else { 'x86_64' }
if ($badging -notmatch ("native-code: '" + $abi + "'")) { throw 'Architecture APK inattendue.' }
$apkArchive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Apk).Path)
try {
    foreach ($name in @('index.html','home.css','home.js','engine.json')) {
        $homeEntry = $apkArchive.GetEntry('assets/yapapouaiye/' + $name)
        if (!$homeEntry) { throw ('Interface Yapapouaiye absente : ' + $name) }
        $algorithm = [Security.Cryptography.SHA256]::Create()
        $homeInput = $homeEntry.Open()
        try { $homeHash = [BitConverter]::ToString($algorithm.ComputeHash($homeInput)).Replace('-', '') }
        finally { $homeInput.Dispose(); $algorithm.Dispose() }
        $expectedAsset = if ($name -eq 'engine.json') { Join-Path $PSScriptRoot '.build/upstream/FCL/src/main/assets/yapapouaiye/engine.json' } else { Join-Path $PSScriptRoot ('ui/' + $name) }
        if ($homeHash -ne (Get-FileHash -LiteralPath $expectedAsset -Algorithm SHA256).Hash) { throw "Interface ou moteur périmé dans l’APK." }
    }
    if ($apkArchive.GetEntry('assets/adoservse/AdoServSE.mrpack')) { throw 'Ancien pack monoserveur encore présent.' }
    if (!$apkArchive.GetEntry('lib/' + $abi + '/libfcl.so')) { throw 'Moteur natif Minecraft absent.' }
    foreach ($java in @('jre8','jre17','jre21','jre25')) {
        if (!$apkArchive.GetEntry('assets/app_runtime/java/' + $java + '/bin-' + $Architecture + '.tar.xz')) { throw ('Runtime Java absent : ' + $java) }
    }
    foreach ($name in @('nexlux-1.1.0.jar', 'nexlux-26.2.jar')) {
        $entry = $apkArchive.GetEntry('assets/yapapouaiye/' + $name)
        if (!$entry) { throw ('Compagnon absent : ' + $name) }
        $algorithm = [Security.Cryptography.SHA256]::Create()
        $inputStream = $entry.Open()
        try { $hash = [BitConverter]::ToString($algorithm.ComputeHash($inputStream)).Replace('-', '') }
        finally { $inputStream.Dispose(); $algorithm.Dispose() }
        if ($hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot ('../mods/' + $name)) -Algorithm SHA256).Hash) { throw ('Compagnon périmé : ' + $name) }
    }
    foreach ($name in @('yapapouaiye-controls-26.2.jar', 'yapapouaiye-controls-1.21.1.jar')) {
        $entry = $apkArchive.GetEntry('assets/yapapouaiye/' + $name)
        if (!$entry) { throw ('Compagnon de commandes Android absent : ' + $name) }
        $algorithm = [Security.Cryptography.SHA256]::Create()
        $inputStream = $entry.Open()
        try { $hash = [BitConverter]::ToString($algorithm.ComputeHash($inputStream)).Replace('-', '') }
        finally { $inputStream.Dispose(); $algorithm.Dispose() }
        $expectedCompanion = Join-Path $PSScriptRoot ('companion/dist/' + $name)
        if ($hash -ne (Get-FileHash -LiteralPath $expectedCompanion -Algorithm SHA256).Hash) { throw ('Compagnon de commandes Android périmé : ' + $name) }
    }
} finally { $apkArchive.Dispose() }
$digest = (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($Apk + '.sha256', $digest + '  ' + [IO.Path]::GetFileName($Apk) + "`n", [Text.UTF8Encoding]::new($false))
Write-Output ('APK vérifié : signature, identité, interface Yapapouaiye, ' + $Architecture + ', moteur natif, Java 8/17/21/25, compagnons NexLux et commandes Android.')
