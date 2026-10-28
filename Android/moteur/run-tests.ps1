param([string]$JavaHome = $env:JAVA_HOME)
$ErrorActionPreference = 'Stop'
$androidDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$junit = Join-Path $androidDirectory '.build/test-libs/junit.jar'
$hamcrest = Join-Path $androidDirectory '.build/test-libs/hamcrest.jar'
if (!(Test-Path -LiteralPath $junit) -or !(Test-Path -LiteralPath $hamcrest)) {
    throw 'JUnit 4 et Hamcrest sont requis dans Android/.build/test-libs.'
}
$javac = if ($JavaHome) { Join-Path $JavaHome 'bin/javac.exe' } else { 'javac.exe' }
$java = if ($JavaHome) { Join-Path $JavaHome 'bin/java.exe' } else { 'java.exe' }
$output = Join-Path $androidDirectory '.build/moteur-unit-classes'
[IO.Directory]::CreateDirectory($output) | Out-Null
$sources = @(
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src/main/java/fr/yapapouaiye/moteur/input') -Filter '*.java' -File
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src/test/java/fr/yapapouaiye/moteur/input') -Filter '*.java' -File
    Get-Item -LiteralPath (Join-Path $PSScriptRoot 'src/main/java/fr/yapapouaiye/moteur/android/DeviceInputMode.java')
    Get-Item -LiteralPath (Join-Path $PSScriptRoot 'src/test/java/fr/yapapouaiye/moteur/android/DeviceInputModeTest.java')
) | ForEach-Object { $_.FullName }
$classpath = $junit + [IO.Path]::PathSeparator + $hamcrest
& $javac '--release' '17' '-encoding' 'UTF-8' '-cp' $classpath '-d' $output @sources
if ($LASTEXITCODE -ne 0) { throw 'Compilation du noyau tactile en échec.' }
& $java '-cp' ($output + [IO.Path]::PathSeparator + $classpath) 'org.junit.runner.JUnitCore' `
    'fr.yapapouaiye.moteur.input.InputStateTest' `
    'fr.yapapouaiye.moteur.input.TouchInputEngineTest' `
    'fr.yapapouaiye.moteur.input.MouseBindingsTest' `
    'fr.yapapouaiye.moteur.input.GamepadBindingsTest' `
    'fr.yapapouaiye.moteur.input.GamepadLookTest' `
    'fr.yapapouaiye.moteur.input.KeyboardKeysTest' `
    'fr.yapapouaiye.moteur.input.TouchButtonTest' `
    'fr.yapapouaiye.moteur.android.DeviceInputModeTest'
if ($LASTEXITCODE -ne 0) { throw 'Tests du noyau tactile en échec.' }
