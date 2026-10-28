param(
    [string]$SdkDirectory = $env:ANDROID_HOME,
    [ValidateSet('arm64', 'x86_64')][string]$Architecture = 'arm64'
)
$ErrorActionPreference = 'Stop'
if (!$SdkDirectory) { $SdkDirectory = $env:ANDROID_SDK_ROOT }
if (!$SdkDirectory) { $SdkDirectory = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (!(Test-Path -LiteralPath (Join-Path $SdkDirectory 'platforms/android-35/android.jar'))) {
    throw 'SDK Android 35 introuvable. Utilisez -SdkDirectory avec le chemin de votre SDK Android.'
}
$SdkDirectory = (Resolve-Path -LiteralPath $SdkDirectory).Path
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'upstream.json') -Raw | ConvertFrom-Json
$source = Join-Path $PSScriptRoot '.build/upstream'
if (!(Test-Path -LiteralPath $source)) {
    & git.exe clone --no-checkout --filter=blob:none $pin.repository $source
    if ($LASTEXITCODE -ne 0) { throw 'Téléchargement des sources FCL impossible.' }
    & git.exe -C $source checkout --detach $pin.commit
    if ($LASTEXITCODE -ne 0) { throw 'Révision FCL verrouillée introuvable.' }
}
& node (Join-Path $PSScriptRoot 'patch-upstream.cjs') $source
if ($LASTEXITCODE -ne 0) { throw 'Adaptation des sources impossible.' }
& node --test (Join-Path $PSScriptRoot 'moteur/tests/compat.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Tests de compatibilité des entrées en échec.' }
[IO.File]::WriteAllText((Join-Path $source 'local.properties'), ('sdk.dir=' + $SdkDirectory.Replace('\', '/') + "`n"), [Text.UTF8Encoding]::new($false))
# Rebuild the final ZIP rather than retaining large unused blocks from incremental APK updates.
$apkOutputDirectory = [IO.Path]::GetFullPath((Join-Path $source 'FCL/build/outputs/apk/fordebug'))
if (Test-Path -LiteralPath $apkOutputDirectory) {
    foreach ($oldApk in (Get-ChildItem -LiteralPath $apkOutputDirectory -Filter '*.apk' -File -Recurse)) {
        $oldApkPath = [IO.Path]::GetFullPath($oldApk.FullName)
        if (!$oldApkPath.StartsWith($apkOutputDirectory + [IO.Path]::DirectorySeparatorChar)) { throw 'Sortie APK inattendue.' }
        Remove-Item -LiteralPath $oldApkPath -Force
    }
}
Push-Location $source
try {
    & .\gradlew.bat ':YapapouaiyeEngine:testDebugUnitTest' ':FCL:testFordebugUnitTest' '--tests' 'com.tungsten.fcl.yapapouaiye.*' ':FCL:assembleFordebug' ('-Darch=' + $Architecture) '--no-daemon' '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw 'Compilation Android en échec.' }
} finally { Pop-Location }
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json).version
$abi = if ($Architecture -eq 'arm64') { 'arm64-v8a' } else { 'x86_64' }
$apk = @(Get-ChildItem -LiteralPath (Join-Path $source 'FCL/build/outputs/apk/fordebug') -Recurse -Filter ('*-' + $abi + '.apk') -File)
if ($apk.Count -ne 1) { throw 'APK compilé introuvable ou ambigu.' }
$dist = Join-Path $PSScriptRoot 'dist'
[IO.Directory]::CreateDirectory($dist) | Out-Null
$output = Join-Path $dist ('Yapapouaiye-Android-' + $version + '-' + $Architecture + '.apk')
Copy-Item -LiteralPath $apk[0].FullName -Destination $output -Force
& (Join-Path $PSScriptRoot 'verify-apk.ps1') -Apk $output -SdkDirectory $SdkDirectory -Architecture $Architecture
Write-Output ('APK prêt : ' + $output)
