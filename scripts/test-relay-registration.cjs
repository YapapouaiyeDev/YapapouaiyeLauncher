// Run the shipped registration through NeoForge's actual PayloadRegistrar.
// Minecraft and the registry sink are boundaries; overload selection, handler
// wrapping and dispatch are real NeoForge code, not a copy of its API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const game = process.env.NEXLUX_GAME_ROOT || path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft');
const jdk = process.env.NEXLUX_JDK || path.join(game, 'runtime/java-runtime-epsilon/bin');

for (const [version, loader] of [['1.21.1', '21.1.264'], ['26.2', '26.2.0.88'], ['26.2', '26.2.0.90'], ['26.2', '26.2.0.93']]) {
  test(`shipped ${version} / NeoForge ${loader} registers and dispatches both relay directions`, t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-registration-'));
    t.after(() => {
      assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(temp).startsWith('nexlux-registration-'));
      fs.rmSync(temp, { recursive: true, force: true });
    });
    const neoRoot = path.join(game, 'loader/neoforge');
    const definition = JSON.parse(fs.readFileSync(path.join(neoRoot, 'versions', `neoforge-${loader}`, `neoforge-${loader}.json`)));
    const shipped = path.join(root, 'mods', version === '1.21.1' ? 'nexlux-1.1.0.jar' : 'nexlux-26.2.jar');
    const libraries = definition.libraries.flatMap(lib => {
      const file = lib.downloads?.artifact?.path;
      if (!file) return [];
      const found = [path.join(neoRoot, 'libraries', file), path.join(game, 'libraries', file)].find(fs.existsSync);
      return found ? [found] : [];
    });
    const classpath = [shipped, path.join(neoRoot, 'libraries/net/neoforged/neoforge', loader, `neoforge-${loader}-universal.jar`), ...libraries];
    const sources = {
      'net/minecraft/network/FriendlyByteBuf.java': 'package net.minecraft.network; public class FriendlyByteBuf {}',
      'net/minecraft/network/RegistryFriendlyByteBuf.java': 'package net.minecraft.network; public class RegistryFriendlyByteBuf extends FriendlyByteBuf {}',
      'net/minecraft/network/ConnectionProtocol.java': 'package net.minecraft.network; public enum ConnectionProtocol { PLAY, CONFIGURATION }',
      'net/minecraft/network/protocol/PacketFlow.java': 'package net.minecraft.network.protocol; public enum PacketFlow { SERVERBOUND, CLIENTBOUND }',
      'net/minecraft/network/codec/StreamCodec.java': 'package net.minecraft.network.codec; public interface StreamCodec<B,T> {}',
      'net/minecraft/network/protocol/common/custom/CustomPacketPayload.java': 'package net.minecraft.network.protocol.common.custom; public interface CustomPacketPayload { public static class Type<T extends CustomPacketPayload> {} }',
      'net/minecraft/world/entity/player/Player.java': 'package net.minecraft.world.entity.player; public class Player {}',
      'net/minecraft/server/level/ServerPlayer.java': 'package net.minecraft.server.level; public class ServerPlayer extends net.minecraft.world.entity.player.Player {}',
      'net/neoforged/neoforge/network/handling/IPayloadContext.java': `package net.neoforged.neoforge.network.handling;
        public interface IPayloadContext {
          net.minecraft.world.entity.player.Player player(); net.minecraft.network.protocol.PacketFlow flow();
          java.util.concurrent.CompletableFuture<Void> enqueueWork(Runnable work);
        }`,
      'fr/yapapouaiye/nexlux/standby/RelayPayload.java': `package fr.yapapouaiye.nexlux.standby;
        public class RelayPayload implements net.minecraft.network.protocol.common.custom.CustomPacketPayload {
          public static final Type<RelayPayload> TYPE=new Type<>();
          public static final net.minecraft.network.codec.StreamCodec<net.minecraft.network.RegistryFriendlyByteBuf,RelayPayload> CODEC=new net.minecraft.network.codec.StreamCodec<>() {};
        }`,
      'fr/yapapouaiye/nexlux/standby/RelayServer.java': `package fr.yapapouaiye.nexlux.standby;
        public class RelayServer { public static int calls; public static void receive(net.minecraft.server.level.ServerPlayer player,RelayPayload message) { calls++; } }`,
      'fr/yapapouaiye/nexlux/standby/RelayClient.java': `package fr.yapapouaiye.nexlux.standby;
        public class RelayClient { public static int calls; public static void receive(RelayPayload message) { calls++; } }`,
      'net/neoforged/neoforge/network/registration/NetworkRegistry.java': `package net.neoforged.neoforge.network.registration;
        import net.minecraft.network.*; import net.minecraft.network.protocol.*; import net.minecraft.network.protocol.common.custom.*;
        import net.minecraft.network.codec.*; import net.neoforged.neoforge.network.handling.*; import java.util.*;
        public class NetworkRegistry {
          public static IPayloadHandler server,client; public static int registrations;
          public static <T extends CustomPacketPayload,B extends FriendlyByteBuf> void register(CustomPacketPayload.Type<T> type,StreamCodec<? super B,T> codec,IPayloadHandler<T> serverHandler,IPayloadHandler<T> clientHandler,List<ConnectionProtocol> protocols,Optional<PacketFlow> flow,String version,boolean optional) {
            if(type!=fr.yapapouaiye.nexlux.standby.RelayPayload.TYPE||!optional||!version.equals("1")||!protocols.equals(List.of(ConnectionProtocol.PLAY))||flow.isPresent()) throw new AssertionError("registration changed");
            registrations++; server=serverHandler; client=clientHandler;
          }
          public static <T extends CustomPacketPayload,B extends FriendlyByteBuf> void register(CustomPacketPayload.Type<T> type,StreamCodec<? super B,T> codec,IPayloadHandler<T> handler,List<ConnectionProtocol> protocols,Optional<PacketFlow> flow,String version,boolean optional) {
            register(type,codec,handler,handler,protocols,flow,version,optional);
          }
        }`,
      'RegistrationTest.java': `import fr.yapapouaiye.nexlux.standby.*;
        import net.minecraft.network.protocol.PacketFlow; import net.neoforged.neoforge.network.handling.*;
        import net.neoforged.neoforge.network.registration.*; import java.util.concurrent.CompletableFuture;
        public class RegistrationTest {
          private static int enqueued;
          private record Context(PacketFlow flow,net.minecraft.world.entity.player.Player player) implements IPayloadContext {
            public CompletableFuture<Void> enqueueWork(Runnable work) { enqueued++; work.run(); return CompletableFuture.completedFuture(null); }
          }
          public static void main(String[] args) throws Exception {
            try(var jar=new java.util.jar.JarFile(args[0])) {
              String metadata=new String(jar.getInputStream(jar.getJarEntry("META-INF/neoforge.mods.toml")).readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
              boolean dependencyFound=false;
              for(String section:metadata.split("\\\\[\\\\[dependencies\\\\.nexlux\\\\]\\\\]")) {
                if(!section.contains("modId=\\\"neoforge\\\"")) continue;
                var match=java.util.regex.Pattern.compile("versionRange=\\\"([^\\\"]+)\\\"").matcher(section);
                if(!match.find()) throw new AssertionError("missing NeoForge dependency range");
                var range=org.apache.maven.artifact.versioning.VersionRange.createFromVersionSpec(match.group(1));
                if(!range.containsVersion(new org.apache.maven.artifact.versioning.DefaultArtifactVersion(args[1]))) throw new AssertionError("NeoForge "+args[1]+" rejected by shipped metadata: "+match.group(1));
                dependencyFound=true;
              }
              if(!dependencyFound && args[1].startsWith("26.")) throw new AssertionError("NeoForge dependency not found");
            }
            RelayRegistration.register(new net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent());
            if(NetworkRegistry.registrations!=1||NetworkRegistry.server==null||NetworkRegistry.client==null) throw new AssertionError("Some clientbound payloads are missing client-side handlers: [nexlux:relay_session]");
            if(!(NetworkRegistry.client instanceof MainThreadPayloadHandler)||!(NetworkRegistry.server instanceof MainThreadPayloadHandler)) throw new AssertionError("not on main thread");
            var message=new RelayPayload();
            NetworkRegistry.server.handle(message,new Context(PacketFlow.SERVERBOUND,new net.minecraft.server.level.ServerPlayer()));
            if(RelayServer.calls!=1||RelayClient.calls!=0) throw new AssertionError("server dispatch failed");
            NetworkRegistry.client.handle(message,new Context(PacketFlow.CLIENTBOUND,new net.minecraft.world.entity.player.Player()));
            if(RelayServer.calls!=1||RelayClient.calls!=1||enqueued!=2) throw new AssertionError("client dispatch failed");
            System.out.println("PASS both relay handlers on main thread");
          }
        }`,
    };
    const files = Object.entries(sources).map(([name, content]) => {
      const file = path.join(temp, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
    });
    const classes = path.join(temp, 'classes'); fs.mkdirSync(classes);
    const argsFile = path.join(temp, 'javac.args');
    const quote = value => `"${value.replaceAll('\\', '/')}"`;
    fs.writeFileSync(argsFile, ['-proc:none', '-encoding', 'UTF-8', '-classpath', quote(classpath.join(path.delimiter)), '-d', quote(classes), ...files.map(quote)].join('\n'));
    execFileSync(path.join(jdk, 'javac.exe'), [`@${argsFile}`], { stdio: 'pipe' });
    const output = execFileSync(path.join(jdk, 'java.exe'), ['-cp', [classes, ...classpath].join(path.delimiter), 'RegistrationTest', shipped, loader], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(output, /PASS both relay handlers on main thread/);
    assert.deepEqual(fs.readFileSync(shipped), fs.readFileSync(path.join(root, 'src/assets', path.basename(shipped))));
  });
}
