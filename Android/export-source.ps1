$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = Join-Path $PSScriptRoot '.build/upstream'
if (!(Test-Path -LiteralPath $source)) { throw "Compilez le projet avant d’exporter ses sources." }
$files = @(& git.exe -C $source ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Inventaire des sources FCL indisponible.' }
$files += 'FCL/src/main/java/com/tungsten/fcl/activity/YapapouaiyeHome.kt'
$files += 'FCL/src/main/java/com/tungsten/fcl/activity/YapapouaiyeGameMenu.java'
$files += 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/YapapouaiyeGamepad.java'
$files += 'FCL/src/androidTest/java/fr/yapapouaiye/moteur/test/ControlsInstrumentation.java'
foreach ($engineFile in (Get-ChildItem -LiteralPath (Join-Path $source 'YapapouaiyeEngine') -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]build[\\/]' })) {
    $files += $engineFile.FullName.Substring($source.Length+1).Replace('\','/')
}
$files += 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/EmbeddedMods.java'
$files += 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/EmbeddedModsTest.java'
$files += 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/LauncherApi.java'
$files += 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/LauncherApiTest.java'
foreach ($name in @('LauncherUpdates', 'GameOptions', 'MinecraftServers', 'AuthenticationErrors', 'DesktopMicrosoftSession')) {
    $files += ('FCL/src/main/java/com/tungsten/fcl/yapapouaiye/' + $name + '.java')
    $files += ('FCL/src/test/java/com/tungsten/fcl/yapapouaiye/' + $name + 'Test.java')
}
$files += 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/HttpRequestRetryTest.java'
foreach ($name in @('index.html','home.css','home.js','engine.json','logo.png','background.png','nexlux-1.1.0.jar','nexlux-26.2.jar','yapapouaiye-controls-26.2.jar','yapapouaiye-controls-1.21.1.jar')) { $files += ('FCL/src/main/assets/yapapouaiye/' + $name) }
$files += 'FCL/src/main/res/drawable/yapapouaiye_logo.png'
$dist = Join-Path $PSScriptRoot 'dist'
[IO.Directory]::CreateDirectory($dist) | Out-Null
$output = Join-Path $dist 'Yapapouaiye-Android-sources.zip'
$stream = [IO.File]::Open($output, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in ($files | Sort-Object -Unique)) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $source $file), ('upstream/' + $file)) | Out-Null
    }
    foreach ($file in @('README.md', 'LICENSE-FCL', 'upstream.json', 'build.ps1', 'build-companion.ps1', 'patch-upstream.cjs', 'verify-apk.ps1', 'export-source.ps1', 'src/YapapouaiyeHome.kt', 'src/YapapouaiyeGameMenu.java', 'src/YapapouaiyeGamepad.java', 'src/EmbeddedMods.java', 'src/LauncherApi.java', 'src/MinecraftServers.java', 'src/LauncherUpdates.java', 'src/GameOptions.java', 'tests/LauncherApiTest.java', 'tests/MinecraftServersTest.java', 'tests/EmbeddedModsTest.java', 'tests/LauncherUpdatesTest.java', 'tests/GameOptionsTest.java', 'tests/home.test.cjs', 'ui/index.html', 'ui/home.css', 'ui/home.js')) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $file), ('Android/' + $file)) | Out-Null
    }
    foreach ($engineFile in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'moteur') -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](build|\.gradle)[\\/]' })) {
        $relative = $engineFile.FullName.Substring($PSScriptRoot.Length+1).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $engineFile.FullName, ('Android/' + $relative)) | Out-Null
    }
    foreach ($companionFile in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'companion') -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](build|\.gradle|\.build)[\\/]' })) {
        $relative = $companionFile.FullName.Substring($PSScriptRoot.Length+1).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $companionFile.FullName, ('Android/' + $relative)) | Out-Null
    }
    # Keep the root inputs read by build-companion.ps1 and patch-upstream.cjs so
    # the documented companion rebuild also works from the source archive.
    foreach ($file in @('version.json', 'assets/logo.png', 'assets/background.png', 'mods/nexlux-1.1.0.jar', 'mods/nexlux-26.2.jar')) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot ('../' + $file)), $file) | Out-Null
    }
    foreach ($file in @('functions/api/android-mods.js', 'functions/_lib/android-mods.js', 'test-android-mods.js')) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot ('../site/' + $file)), ('site/' + $file)) | Out-Null
    }
    foreach ($file in @('version.json','MICROSOFT.md','microsoft.json','src/AuthenticationErrors.java','tests/AuthenticationErrorsTest.java','tests/HttpRequestRetryTest.java','src/DesktopMicrosoftSession.java','tests/DesktopMicrosoftSessionTest.java')) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $file), ('Android/' + $file)) | Out-Null
    }
    $entry = $archive.CreateEntry('BUILD-SOURCES.md')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write("# Rebuild the corresponding Android source`n`nInstall JDK 17/21, Android SDK 35, NDK 27.0.12077973 and CMake 3.22.1. In upstream/, create local.properties with sdk.dir=C:/your/Android/Sdk, then run:`n`n    gradlew.bat :FCL:assembleFordebug -Darch=arm64 --no-daemon`n`nThe patched source, NexLux companion mods and Android controls companion mods are already included. The complete Android controls companion source, resources, tests and license are in Android/companion/. To rebuild these mods, use JDK 25 and Android/build-companion.ps1 with the dependencies and options described in Android/companion/README.md. Copy the resulting Android/companion/dist/yapapouaiye-controls-*.jar files into upstream/FCL/src/main/assets/yapapouaiye/ before rebuilding the APK.`n`nNo PC accounts or credentials are required. The result is a development-signed APK. Sources and notices: upstream/LICENSE, upstream/README.md, Android/README.md and Android/companion/LICENSE.`n") }
    finally { $writer.Dispose() }
} finally { $archive.Dispose(); $stream.Dispose() }
Write-Output ('Sources exportées : ' + $output)
