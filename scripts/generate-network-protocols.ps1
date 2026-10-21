param([string]$GameRoot = (Join-Path $env:APPDATA '.yapapouaiye-launcher/minecraft'), [switch]$Check)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$result = [ordered]@{}
foreach ($version in @('1.21.1', '26.2')) {
    $vanilla = Join-Path $GameRoot "versions/$version/$version.jar"
    $mapped = if ($version -eq '1.21.1') {
        Join-Path $GameRoot 'loader/neoforge/libraries/net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar'
    } else { $vanilla }
    $zip = [IO.Compression.ZipFile]::OpenRead($vanilla)
    try {
        $reader = [IO.StreamReader]::new($zip.GetEntry('version.json').Open())
        try { $definition = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    } finally { $zip.Dispose() }
    $entry = [ordered]@{ protocol = $definition.protocol_version }
    foreach ($kind in @('login', 'configuration', 'game')) {
        $class = @{ login='LoginProtocols'; configuration='ConfigurationProtocols'; game='GameProtocols' }[$kind]
        $listing = & "$GameRoot/runtime/java-runtime-epsilon/bin/javap.exe" -c -p -classpath $mapped "net.minecraft.network.protocol.$kind.$class"
        if ($LASTEXITCODE -ne 0) { throw "Lecture de $version / $class impossible" }
        $ids = [ordered]@{}
        $next = @{ CLIENTBOUND=0; SERVERBOUND=0 }
        foreach ($line in $listing) {
            if ($line -match '// Field [^ ]+PacketTypes\.((CLIENTBOUND|SERVERBOUND)_[A-Z_]+):') {
                $name = $Matches[1]; $direction = $Matches[2]
                if ($name -match 'KEEP_ALIVE|PLAYER_POSITION$|_LOGIN$|_RESPAWN$|GAME_PROFILE$|LOGIN_ACKNOWLEDGED|FINISH|KNOWN_PACKS|_PING$|_PONG$|DISCONNECT|RESOURCE_PACK_PUSH|SERVERBOUND_RESOURCE_PACK$|TICK_END|CLIENT_INFORMATION|CHUNK_BATCH_FINISHED|CHUNK_BATCH_RECEIVED|CONFIGURATION|_HELLO$|_KEY$|COMPRESSION|CUSTOM_QUERY|COOKIE_REQUEST|COOKIE_RESPONSE|CUSTOM_PAYLOAD|ACCEPT_TELEPORTATION|PLAYER_LOADED|CODE_OF_CONDUCT|_TRANSFER$') {
                    $ids[$name] = $next[$direction]
                }
                $next[$direction]++
            }
        }
        $entry[$kind] = $ids
    }
    $result[$version] = $entry
}
$target = Join-Path (Split-Path $PSScriptRoot -Parent) 'src/network-protocols.json'
$json = ($result | ConvertTo-Json -Depth 5) + "`n"
if ($Check) {
    $existing = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 5
    if ($existing -ne ($result | ConvertTo-Json -Depth 5)) { throw 'Les identifiants réseau diffèrent des fichiers Minecraft installés.' }
    Write-Output 'Protocoles 1.21.1 et 26.2 vérifiés contre les fichiers Minecraft installés.'
} else { [IO.File]::WriteAllText($target, $json, [Text.UTF8Encoding]::new($false)) }
