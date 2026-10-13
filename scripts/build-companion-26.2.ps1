param([string]$GameRoot = (Join-Path $env:APPDATA '.yapapouaiye-launcher\minecraft'))
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$jdk = Join-Path $GameRoot 'runtime/java-runtime-epsilon/bin'
$version = '26.2.0.90'
$patched = Join-Path $GameRoot "loader/neoforge/libraries/net/neoforged/minecraft-client-patched/$version/minecraft-client-patched-$version.jar"
$neo = Join-Path $GameRoot "loader/neoforge/libraries/net/neoforged/neoforge/$version/neoforge-$version-universal.jar"
$libraries = [Collections.Generic.List[string]]::new()
$libraries.Add($patched)
foreach ($jsonPath in @("$GameRoot/versions/26.2/26.2.json", "$GameRoot/loader/neoforge/versions/neoforge-$version/neoforge-$version.json")) {
    $definition = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
    foreach ($lib in $definition.libraries) {
        $artifact = $lib.downloads.artifact.path
        if (!$artifact) { continue }
        foreach ($base in @("$GameRoot/loader/neoforge/libraries", "$GameRoot/libraries")) {
            $candidate = Join-Path $base $artifact
            if (Test-Path -LiteralPath $candidate) { $libraries.Add($candidate); break }
        }
    }
}
$libraries.Add($neo)
foreach ($required in @($patched, $neo, "$jdk/javac.exe")) {
    if (!(Test-Path -LiteralPath $required)) { throw "Dépendance absente : $required. Installer Minecraft 26.2 / NeoForge $version avant compilation." }
}
# Each build uses an empty output directory: removed classes cannot leak into the JAR.
$buildDir = Join-Path $env:TEMP ('nexlux26-build-' + [guid]::NewGuid())
$classes = Join-Path $buildDir 'classes'
New-Item -ItemType Directory -Path $classes -Force | Out-Null
$argsFile = Join-Path $buildDir 'javac.args'
$compileArgs = @('-encoding', 'UTF-8', '-proc:none', '--release', '25', '-classpath', ('"' + (($libraries | Select-Object -Unique) -join ';').Replace('\','/') + '"'), '-d', ('"' + $classes.Replace('\','/') + '"'))
$compileArgs += Get-ChildItem -LiteralPath "$repo/companion/26.2/src" -Recurse -Filter '*.java' | ForEach-Object { '"' + $_.FullName.Replace('\','/') + '"' }
[IO.File]::WriteAllLines($argsFile, $compileArgs, [Text.UTF8Encoding]::new($false))
& "$jdk/javac.exe" "@$argsFile"
if ($LASTEXITCODE -ne 0) { throw 'Compilation NexLux échouée' }
$jar = Join-Path $buildDir 'nexlux-26.2.jar'
& "$jdk/jar.exe" --create --file $jar -C $classes . -C "$repo/companion/26.2/resources" .
if ($LASTEXITCODE -ne 0) { throw 'Création JAR échouée' }
Copy-Item -LiteralPath $jar -Destination "$repo/mods/nexlux-26.2.jar" -Force
Copy-Item -LiteralPath $jar -Destination "$repo/src/assets/nexlux-26.2.jar" -Force
Write-Output "NexLux 26.2 compilé : $jar"
