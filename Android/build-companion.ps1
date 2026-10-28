param(
    [string]$GameRoot = (Join-Path $env:APPDATA '.yapapouaiye-launcher\minecraft'),
    [string]$GameRoot1211 = '',
    [string]$JdkDirectory = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (!$JdkDirectory) { $JdkDirectory = Join-Path $GameRoot 'runtime/java-runtime-epsilon/bin' }
$javac = Join-Path $JdkDirectory 'javac.exe'
$java = Join-Path $JdkDirectory 'java.exe'
$jarTool = Join-Path $JdkDirectory 'jar.exe'
foreach ($required in @($javac, $java, $jarTool)) {
    if (!(Test-Path -LiteralPath $required)) { throw "JDK 25 absent : $required" }
}
$buildDir = Join-Path $PSScriptRoot ('.build/controls-companion-' + [guid]::NewGuid())
$testClasses = Join-Path $buildDir 'tests'
[IO.Directory]::CreateDirectory($testClasses) | Out-Null
$common = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'companion/common/sources') -Recurse -Filter '*.java')
& $javac --release 21 -encoding UTF-8 -d $testClasses @($common.FullName) (Join-Path $PSScriptRoot 'companion/tests/DeathChatSessionTest.java') (Join-Path $PSScriptRoot 'companion/tests/GammaRangeTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Compilation du test des commandes impossible.' }
& $java -cp $testClasses fr.yapapouaiye.controls.DeathChatSessionTest
if ($LASTEXITCODE -ne 0) { throw 'Tests des commandes en échec.' }
& $java -cp $testClasses fr.yapapouaiye.controls.GammaRangeTest
if ($LASTEXITCODE -ne 0) { throw 'Test luminosité en échec.' }
$version = (Get-Content -LiteralPath (Join-Path $repo 'version.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $PSScriptRoot 'companion/dist'
[IO.Directory]::CreateDirectory($dist) | Out-Null
foreach ($target in @(
    @{ Minecraft='26.2'; NeoForge='26.2.0.93'; Java=25 },
    @{ Minecraft='1.21.1'; NeoForge='21.1.264'; Java=21 }
)) {
    $mc = $target.Minecraft
    $neo = $target.NeoForge
    $targetRoot = if ($mc -eq '1.21.1' -and $GameRoot1211) { $GameRoot1211 } else { $GameRoot }
    $screenTests = Join-Path $buildDir "tests-screen-$mc"
    [IO.Directory]::CreateDirectory($screenTests) | Out-Null
    & $javac --release 21 -encoding UTF-8 -d $screenTests (Join-Path $PSScriptRoot 'companion/tests/stubs/net/minecraft/client/gui/screens/ChatScreen.java') (Join-Path $PSScriptRoot "companion/$mc/sources/fr/yapapouaiye/controls/DeathChatScreen.java") (Join-Path $PSScriptRoot 'companion/tests/DeathChatScreenTest.java')
    if ($LASTEXITCODE -ne 0) { throw "Compilation du test de saisie $mc impossible." }
    & $java -cp $screenTests fr.yapapouaiye.controls.DeathChatScreenTest $mc
    if ($LASTEXITCODE -ne 0) { throw "Tests de saisie $mc en échec." }
    $libraries = [Collections.Generic.List[string]]::new()
    if ($mc -eq '26.2') {
        $libraries.Add((Join-Path $targetRoot "loader/neoforge/libraries/net/neoforged/minecraft-client-patched/$neo/minecraft-client-patched-$neo.jar"))
    } else {
        $libraries.Add((Join-Path $targetRoot "loader/neoforge/libraries/net/neoforged/neoforge/$neo/neoforge-$neo-client.jar"))
        $libraries.Add((Join-Path $targetRoot 'loader/neoforge/libraries/net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar'))
    }
    $libraries.Add((Join-Path $targetRoot "loader/neoforge/libraries/net/neoforged/neoforge/$neo/neoforge-$neo-universal.jar"))
    foreach ($required in $libraries) {
        if (!(Test-Path -LiteralPath $required)) { throw "Dépendance officielle absente : $required" }
    }
    foreach ($jsonPath in @("$targetRoot/versions/$mc/$mc.json", "$targetRoot/loader/neoforge/versions/neoforge-$neo/neoforge-$neo.json")) {
        $definition = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
        foreach ($lib in $definition.libraries) {
            $artifact = $lib.downloads.artifact.path
            if (!$artifact) { continue }
            foreach ($libraryRoot in @("$targetRoot/loader/neoforge/libraries", "$targetRoot/libraries")) {
                $candidate = Join-Path $libraryRoot $artifact
                if (Test-Path -LiteralPath $candidate) { $libraries.Add($candidate); break }
            }
        }
    }
    $targetBuild = Join-Path $buildDir $mc
    $classes = Join-Path $targetBuild 'classes'
    $resources = Join-Path $targetBuild 'resources'
    [IO.Directory]::CreateDirectory($classes) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $resources 'META-INF')) | Out-Null
    $sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "companion/$mc/sources") -Recurse -Filter '*.java') + $common
    $compileArgs = @('-encoding','UTF-8','-proc:none','--release', [string]$target.Java, '-classpath', ('"'+(($libraries | Select-Object -Unique) -join ';').Replace('\','/')+'"'), '-d', ('"'+$classes.Replace('\','/')+'"'))
    $compileArgs += @($sources | ForEach-Object { '"'+$_.FullName.Replace('\','/')+'"' })
    $argsFile = Join-Path $targetBuild 'javac.args'
    [IO.File]::WriteAllLines($argsFile,$compileArgs,[Text.UTF8Encoding]::new($false))
    & $javac ('@'+$argsFile)
    if ($LASTEXITCODE -ne 0) { throw "Compilation du compagnon $mc en échec." }
    $metadata = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "companion/$mc/resources/META-INF/neoforge.mods.toml")).Replace('@VERSION@',$version)
    [IO.File]::WriteAllText((Join-Path $resources 'META-INF/neoforge.mods.toml'),$metadata,[Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'companion/LICENSE') -Destination (Join-Path $resources 'LICENSE')
    foreach ($resource in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "companion/$mc/resources") -File)) { Copy-Item -LiteralPath $resource.FullName -Destination $resources }
    $output = Join-Path $dist "yapapouaiye-controls-$mc.jar"
    $pending = Join-Path $targetBuild "yapapouaiye-controls-$mc.jar"
    & $jarTool --create --file $pending -C $classes . -C $resources .
    if ($LASTEXITCODE -ne 0) { throw "Création du JAR $mc impossible." }
    Copy-Item -LiteralPath $pending -Destination $output -Force
    Write-Output "Compagnon Android prêt : $output"
}
