param([string]$GameRoot = (Join-Path $env:APPDATA '.yapapouaiye-launcher\minecraft'), [string]$JdkPath = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$jdk = if ($JdkPath) { $JdkPath } else { Join-Path $GameRoot 'runtime/java-runtime-epsilon/bin' }
$loaderVersion = '21.1.264'
$client = Join-Path $GameRoot "loader/neoforge/libraries/net/neoforged/neoforge/$loaderVersion/neoforge-$loaderVersion-client.jar"
$base = Join-Path $GameRoot 'loader/neoforge/libraries/net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar'
$libraries = [Collections.Generic.List[string]]::new()
$libraries.Add($client)
$libraries.Add((Join-Path $GameRoot "loader/neoforge/libraries/net/neoforged/neoforge/$loaderVersion/neoforge-$loaderVersion-universal.jar"))
$libraries.Add($base)
foreach ($jsonPath in @("$GameRoot/versions/1.21.1/1.21.1.json", "$GameRoot/loader/neoforge/versions/neoforge-$loaderVersion/neoforge-$loaderVersion.json")) {
    $definition = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
    foreach ($lib in $definition.libraries) {
        $artifact = $lib.downloads.artifact.path
        if (!$artifact) { continue }
        foreach ($libraryRoot in @("$GameRoot/loader/neoforge/libraries", "$GameRoot/libraries")) {
            $candidate = Join-Path $libraryRoot $artifact
            if (Test-Path -LiteralPath $candidate) { $libraries.Add($candidate); break }
        }
    }
}
foreach ($required in @($client, $base, "$jdk/javac.exe")) {
    if (!(Test-Path -LiteralPath $required)) { throw "Dépendance absente : $required" }
}
$buildDir = Join-Path $repo ('scratch/nexlux21-standby-' + [guid]::NewGuid())
$classes = Join-Path $buildDir 'classes'
$metadata = Join-Path $buildDir 'metadata/META-INF'
New-Item -ItemType Directory -Path $classes, $metadata -Force | Out-Null
$argsFile = Join-Path $buildDir 'javac.args'
$compileArgs = @('-encoding', 'UTF-8', '-proc:none', '--release', '21', '-classpath', ('"' + (($libraries | Select-Object -Unique) -join ';').Replace('\','/') + '"'), '-d', ('"' + $classes.Replace('\','/') + '"'))
$compileArgs += Get-ChildItem -LiteralPath "$repo/companion/standby/common", "$repo/companion/standby/1.21.1" -Recurse -Filter '*.java' | ForEach-Object { '"' + $_.FullName.Replace('\','/') + '"' }
[IO.File]::WriteAllLines($argsFile, $compileArgs, [Text.UTF8Encoding]::new($false))
& "$jdk/javac.exe" "@$argsFile"
if ($LASTEXITCODE -ne 0) { throw 'Compilation du mode veille 1.21.1 échouée' }

# Preserve every existing companion class: only add the new client module and
# register its client-only mixins. The original JAR is replaced after success.
$original = Join-Path $repo 'mods/nexlux-1.1.0.jar'
$jar = Join-Path $buildDir 'nexlux-1.1.0.jar'
Copy-Item -LiteralPath $original -Destination $jar
$zip = [IO.Compression.ZipFile]::OpenRead($original)
try {
    $reader = [IO.StreamReader]::new($zip.GetEntry('META-INF/neoforge.mods.toml').Open())
    try { $toml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }
if (!$toml.Contains('nexlux-standby.mixins.json')) {
    $toml += "`n[[mixins]]`nconfig=`"nexlux-standby.mixins.json`"`n"
}
[IO.File]::WriteAllText((Join-Path $metadata 'neoforge.mods.toml'), $toml, [Text.UTF8Encoding]::new($false))
& "$jdk/jar.exe" "-J-Djava.io.tmpdir=$buildDir" --update --file $jar -C $classes . -C "$buildDir/metadata" META-INF/neoforge.mods.toml -C "$repo/companion/standby/1.21.1" nexlux-standby.mixins.json
if ($LASTEXITCODE -ne 0) { throw 'Création du compagnon 1.21.1 échouée' }
Copy-Item -LiteralPath $jar -Destination $original -Force
Copy-Item -LiteralPath $jar -Destination "$repo/src/assets/nexlux-1.1.0.jar" -Force
Write-Output "NexLux 1.21.1 avec mode veille compilé : $jar"
