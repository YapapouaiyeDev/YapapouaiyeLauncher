// Run the shipped classes against two connected endpoints, without a game/server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const game = process.env.NEXLUX_GAME_ROOT || path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft');
const jdk = process.env.NEXLUX_JDK || path.join(game, 'runtime/java-runtime-epsilon/bin');
const sources = {
  'fr/yapapouaiye/nexlux/standby/StandbyClient.java': 'package fr.yapapouaiye.nexlux.standby; public class StandbyClient { public static int cleanups; public static void scheduleMemoryCleanup() { cleanups++; } }',
  'net/minecraft/network/chat/Component.java': 'package net.minecraft.network.chat; public interface Component {}',
  'net/minecraft/world/damagesource/CombatTracker.java': 'package net.minecraft.world.damagesource; public class CombatTracker { public net.minecraft.network.chat.Component getDeathMessage() { return null; } }',
  'net/minecraft/network/protocol/game/ClientboundPlayerCombatKillPacket.java': 'package net.minecraft.network.protocol.game; public record ClientboundPlayerCombatKillPacket(int id, net.minecraft.network.chat.Component message) implements net.minecraft.network.protocol.Packet<Object> {}',
  'net/minecraft/network/protocol/Packet.java': 'package net.minecraft.network.protocol; public interface Packet<T> {}',
  'net/minecraft/network/protocol/common/custom/CustomPacketPayload.java': 'package net.minecraft.network.protocol.common.custom; public interface CustomPacketPayload { class Type<T> { public net.minecraft.resources.Identifier id() { return null; } } }',
  'net/minecraft/resources/Identifier.java': 'package net.minecraft.resources; public class Identifier {}',
  'net/minecraft/network/Connection.java': `package net.minecraft.network;
    public class Connection extends fr.yapapouaiye.nexlux.standby.mixin.StandbyConnectionMixin {
      public java.util.List<net.minecraft.network.protocol.Packet<?>> sent = new java.util.ArrayList<>();
      public void send(net.minecraft.network.protocol.Packet<?> packet) { sent.add(packet); }
    }`,
  'fr/yapapouaiye/nexlux/standby/RelayPayload.java': `package fr.yapapouaiye.nexlux.standby; import java.util.UUID;
    public record RelayPayload(int operation, UUID request) implements net.minecraft.network.protocol.common.custom.CustomPacketPayload {
      public static final int CAPABILITIES=1,RESYNC=2,BEGIN=3,END=4,BACKGROUND=5,ERROR=9,HELLO=10;
      public static final net.minecraft.network.protocol.common.custom.CustomPacketPayload.Type<RelayPayload> TYPE=new net.minecraft.network.protocol.common.custom.CustomPacketPayload.Type<>();
    }`,
  'net/minecraft/network/protocol/common/ServerboundCustomPayloadPacket.java': 'package net.minecraft.network.protocol.common; public record ServerboundCustomPayloadPacket(net.minecraft.network.protocol.common.custom.CustomPacketPayload payload) implements net.minecraft.network.protocol.Packet<Object> {}',
  'net/minecraft/network/protocol/common/ClientboundCustomPayloadPacket.java': 'package net.minecraft.network.protocol.common; public record ClientboundCustomPayloadPacket(net.minecraft.network.protocol.common.custom.CustomPacketPayload payload) implements net.minecraft.network.protocol.Packet<Object> {}',
  'net/neoforged/neoforge/common/extensions/ICommonPacketListener.java': 'package net.neoforged.neoforge.common.extensions; public interface ICommonPacketListener {}',
  'net/neoforged/neoforge/network/registration/NetworkRegistry.java': `package net.neoforged.neoforge.network.registration;
    public class NetworkRegistry { public static boolean available=true; public static boolean hasChannel(net.neoforged.neoforge.common.extensions.ICommonPacketListener listener, net.minecraft.resources.Identifier id) { return available; } }`,
  'net/neoforged/neoforge/network/PacketDistributor.java': `package net.neoforged.neoforge.network;
    public class PacketDistributor { public static void sendToPlayer(net.minecraft.server.level.ServerPlayer p, net.minecraft.network.protocol.common.custom.CustomPacketPayload payload, net.minecraft.network.protocol.common.custom.CustomPacketPayload... extra) {
      p.connection.getConnection().send(new net.minecraft.network.protocol.common.ClientboundCustomPayloadPacket(payload));
    } }`,
  'net/minecraft/server/network/ServerGamePacketListenerImpl.java': `package net.minecraft.server.network;
    public class ServerGamePacketListenerImpl extends fr.yapapouaiye.nexlux.standby.mixin.StandbyServerChatMixin {
      public net.minecraft.server.level.ServerPlayer player;
      public net.minecraft.network.Connection connection=new net.minecraft.network.Connection();
      public net.minecraft.network.Connection getConnection() { return connection; }
      public void send(net.minecraft.network.protocol.Packet<?> packet) { connection.send(packet); }
    }`,
  'net/minecraft/server/level/ServerPlayer.java': `package net.minecraft.server.level;
    public class ServerPlayer {
      public net.minecraft.server.network.ServerGamePacketListenerImpl connection=new net.minecraft.server.network.ServerGamePacketListenerImpl();
      private final java.util.UUID id=java.util.UUID.randomUUID();
      public boolean dead;
      public boolean isDeadOrDying() { return dead; } public int getId() { return 1; }
      public net.minecraft.world.damagesource.CombatTracker getCombatTracker() { return new net.minecraft.world.damagesource.CombatTracker(); }
      public ServerPlayer() { connection.player=this; }
      public java.util.UUID getUUID() { return id; }
      public void stopUsingItem() {} public void setShiftKeyDown(boolean b) {} public void setSprinting(boolean b) {}
    }`,
  'fr/yapapouaiye/nexlux/standby/RelayPlatform.java': 'package fr.yapapouaiye.nexlux.standby; public class RelayPlatform { public static void releaseInput(net.minecraft.server.level.ServerPlayer p) {} }',
  'fr/yapapouaiye/nexlux/standby/RelayServer.java': `package fr.yapapouaiye.nexlux.standby;
    public class RelayServer { public static int refreshes; static void refresh(net.minecraft.server.level.ServerPlayer p, java.util.UUID id) {
      if(StandbyServer.sleeping(p))throw new AssertionError("gate must open before rebuilding world"); refreshes++;
      net.neoforged.neoforge.network.PacketDistributor.sendToPlayer(p,new RelayPayload(RelayPayload.END,id));
    } }`,
  'net/minecraft/client/multiplayer/ClientChunkCache.java': 'package net.minecraft.client.multiplayer; public class ClientChunkCache { public int radius=12; public void updateViewRadius(int r) { radius=r; } }',
  'net/minecraft/client/multiplayer/ClientLevel.java': `package net.minecraft.client.multiplayer; public class ClientLevel {
    public ClientChunkCache chunks=new ClientChunkCache(); public ClientChunkCache getChunkSource() { return chunks; }
  }`,
  'net/minecraft/client/multiplayer/ClientPacketListener.java': `package net.minecraft.client.multiplayer;
    public class ClientPacketListener implements net.neoforged.neoforge.common.extensions.ICommonPacketListener {
      public net.minecraft.network.Connection connection=new net.minecraft.network.Connection(); public net.minecraft.network.Connection getConnection() { return connection; }
    }`,
  'net/minecraft/client/particle/ParticleEngine.java': 'package net.minecraft.client.particle; public class ParticleEngine implements fr.yapapouaiye.nexlux.standby.mixin.StandbyParticlesMixin { public int cleared; public void nexlux$clearParticles() { cleared++; } }',
  'net/minecraft/client/Minecraft.java': `package net.minecraft.client; public class Minecraft {
    private static final Minecraft INSTANCE=new Minecraft(); public static Minecraft getInstance() { return INSTANCE; }
    public net.minecraft.client.multiplayer.ClientLevel level=new net.minecraft.client.multiplayer.ClientLevel();
    public net.minecraft.client.particle.ParticleEngine particleEngine=new net.minecraft.client.particle.ParticleEngine();
    public net.minecraft.client.multiplayer.ClientPacketListener listener=new net.minecraft.client.multiplayer.ClientPacketListener();
    public net.minecraft.client.multiplayer.ClientPacketListener getConnection() { return listener; }
  }`,
  'NetworkStandbyTest.java': `import fr.yapapouaiye.nexlux.standby.*;
    import net.minecraft.client.Minecraft; import net.minecraft.network.*; import net.minecraft.network.protocol.*;
    import net.minecraft.network.protocol.common.*; import net.minecraft.server.level.ServerPlayer;
    import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
    public class NetworkStandbyTest {
      static void check(boolean value,String message) { if(!value)throw new AssertionError(message); }
      static RelayPayload request(Connection c) { return (RelayPayload)((ServerboundCustomPayloadPacket)c.sent.remove(0)).payload(); }
      static RelayPayload response(Connection c) { return (RelayPayload)((ClientboundCustomPayloadPacket)c.sent.remove(0)).payload(); }
      static class WorldProbe extends fr.yapapouaiye.nexlux.standby.mixin.StandbyWorldTickMixin {}
      static class ChunkProbe extends fr.yapapouaiye.nexlux.standby.mixin.StandbyChunkSenderMixin {}
      static boolean call(Object probe,Class<?> type,String method,Class<?>[] types,Object... args)throws Exception {
        var m=type.getDeclaredMethod(method,types);m.setAccessible(true);var ci=new CallbackInfo(method,true);
        Object[] values=java.util.Arrays.copyOf(args,args.length+1);values[args.length]=ci;m.invoke(probe,values);return ci.isCancelled();
      }
      static boolean frozenTick()throws Exception { return call(new WorldProbe(),WorldProbe.class.getSuperclass(),"nexlux$freezeWorld",new Class[]{CallbackInfo.class}); }
      public static void main(String[] args)throws Exception {
        var mc=Minecraft.getInstance(); var client=mc.listener.getConnection(); var player=new ServerPlayer();var server=player.connection.getConnection();
        StandbyNetworkClient.enter();check(!StandbyNetworkClient.frozen(),"never freeze without server agreement");
        StandbyNetworkClient.receive(new RelayPayload(RelayPayload.CAPABILITIES,StandbyProtocol.PROBE));
        check(!StandbyNetworkClient.frozen()&&StandbyNetworkClient.status().contains("non compatible"),"old server stays usable");client.sent.clear();
        StandbyNetworkClient.enter();check(request(client).operation()==RelayPayload.HELLO,"probe");
        StandbyServer.receive(player,new RelayPayload(RelayPayload.HELLO,StandbyProtocol.PROBE));StandbyNetworkClient.receive(response(server));
        StandbyServer.receive(player,request(client));check(StandbyServer.sleeping(player),"server gate on");
        check(!StandbyNetworkClient.frozen(),"wait for entry acknowledgement");StandbyNetworkClient.receive(response(server));
        check(StandbyNetworkClient.frozen()&&frozenTick(),"client simulation frozen");check(mc.level.chunks.radius==2,"trim chunk cache only after agreement");
        check(StandbyClient.cleanups==1,"collect after the reduced chunk cache is installed");
        Packet<?> world=new Packet<Object>(){};
        check(StandbyServer.suppress(server,world),"world updates suppressed");
        check(!StandbyServer.suppress(server,new ClientboundKeepAlivePacket()),"keepalive allowed");
        check(!StandbyServer.suppress(server,new ClientboundPingPacket()),"ping allowed");
        check(!StandbyServer.suppress(server,new net.minecraft.network.protocol.game.ClientboundPlayerPositionPacket()),"mandatory teleport confirmation allowed");
        check(!StandbyServer.suppress(new Connection(),world),"other connections unaffected");
        check(call(server,server.getClass().getSuperclass(),"nexlux$gateWorldPackets",new Class[]{Packet.class,Object.class,boolean.class,CallbackInfo.class},world,null,true),"actual connection mixin blocks world");
        check(call(player.connection,player.connection.getClass().getSuperclass(),"nexlux$skipSleepingChat",new Class[]{CallbackInfo.class}),"do not create unacknowledged signed chat");
        check(call(new ChunkProbe(),ChunkProbe.class.getSuperclass(),"nexlux$skipSleepingChunks",new Class[]{ServerPlayer.class,CallbackInfo.class},player),"do not generate unacknowledged chunk batches");
        player.dead=true;StandbyNetworkClient.resume();check(frozenTick(),"stay frozen during resync");StandbyServer.receive(player,request(client));
        check(!StandbyServer.sleeping(player)&&RelayServer.refreshes==1,"same player resynced with gate open");StandbyNetworkClient.receive(response(server));
        check(!StandbyNetworkClient.frozen()&&!frozenTick(),"world resumes after snapshot");
        check(server.sent.remove(0) instanceof net.minecraft.network.protocol.game.ClientboundPlayerCombatKillPacket,"death during standby appears on wake");
        StandbyServer.receive(player,new RelayPayload(RelayPayload.RESYNC,StandbyProtocol.WAKE));check(RelayServer.refreshes==1,"duplicate wake cannot rebuild twice");
        StandbyServer.receive(player,new RelayPayload(RelayPayload.BACKGROUND,StandbyProtocol.ENTER));check(response(server).operation()==RelayPayload.ERROR,"resync spam throttled");
        var other=new ServerPlayer();StandbyServer.receive(other,new RelayPayload(RelayPayload.BACKGROUND,StandbyProtocol.ENTER));
        check(!StandbyServer.suppress(other.connection.getConnection(),new ClientboundDisconnectPacket()),"disconnect must reach client");check(!StandbyServer.sleeping(other),"disconnect releases gate");
        StandbyNetworkClient.enter();request(client);StandbyNetworkClient.resume();StandbyNetworkClient.receive(new RelayPayload(RelayPayload.BACKGROUND,StandbyProtocol.PROBE));check(client.sent.isEmpty(),"cancelled probe cannot enter late");
        StandbyNetworkClient.enter();request(client);StandbyNetworkClient.receive(new RelayPayload(RelayPayload.BACKGROUND,StandbyProtocol.PROBE));request(client);
        StandbyNetworkClient.resume();check(request(client).operation()==RelayPayload.RESYNC,"resume before ack still sends wake");
        StandbyNetworkClient.receive(new RelayPayload(RelayPayload.BACKGROUND,StandbyProtocol.ENTER));check(StandbyNetworkClient.frozen(),"late ack must not cancel wake");
        StandbyNetworkClient.receive(new RelayPayload(RelayPayload.END,StandbyProtocol.WAKE));check(!StandbyNetworkClient.frozen(),"late ack recovery");
        StandbyNetworkClient.enter();request(client);
        {
          var oldListener=mc.listener; mc.listener=new net.minecraft.client.multiplayer.ClientPacketListener();
          StandbyNetworkClient.receive(new RelayPayload(RelayPayload.BACKGROUND,StandbyProtocol.PROBE));
          check(client.sent.isEmpty(),"stale standby acknowledgement cannot act on a replacement connection");
          StandbyNetworkClient.tick();check(!StandbyNetworkClient.frozen(),"replacement connection clears network freeze");
          mc.listener=oldListener;
        }
        mc.listener=null;StandbyNetworkClient.tick();check(!StandbyNetworkClient.frozen(),"disconnect clears client state");
        System.out.println("PASS: server gate, minimal protocol, frozen world, same-connection wake, cancellation and isolation");
      }
    }`,
};
for (const name of ['ClientboundKeepAlivePacket', 'ClientboundPingPacket', 'ClientboundDisconnectPacket', 'ClientboundTransferPacket']) {
  sources[`net/minecraft/network/protocol/common/${name}.java`] = `package net.minecraft.network.protocol.common; public class ${name} implements net.minecraft.network.protocol.Packet<Object> {}`;
}
for (const name of ['ClientboundStartConfigurationPacket', 'ClientboundPlayerPositionPacket']) {
  sources[`net/minecraft/network/protocol/game/${name}.java`] = `package net.minecraft.network.protocol.game; public class ${name} implements net.minecraft.network.protocol.Packet<Object> {}`;
}
for (const version of ['1.21.1', '26.2']) test(`network standby ${version}: server silence, live connection and reversible freeze`, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-network-standby-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const jar = path.join(root, 'mods', version === '1.21.1' ? 'nexlux-1.1.0.jar' : 'nexlux-26.2.jar');
  const mixins = path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft/loader/neoforge/libraries/net/fabricmc/sponge-mixin/0.17.4+mixin.0.8.7/sponge-mixin-0.17.4+mixin.0.8.7.jar');
  const local = { ...sources };
  if (version === '1.21.1') {
    local['net/minecraft/resources/ResourceLocation.java'] = 'package net.minecraft.resources; public class ResourceLocation {}';
    for (const file of ['net/minecraft/network/protocol/common/custom/CustomPacketPayload.java', 'net/neoforged/neoforge/network/registration/NetworkRegistry.java']) local[file] = local[file].replaceAll('Identifier', 'ResourceLocation');
  }
  const files = [];
  for (const [name, source] of Object.entries(local)) {
    const file = path.join(temp, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); files.push(file);
  }
  const classes = path.join(temp, 'classes'); fs.mkdirSync(classes);
  const args = path.join(temp, 'javac.args');
  fs.writeFileSync(args, ['-proc:none', '-encoding', 'UTF-8', '-classpath', `"${[jar, mixins].join(path.delimiter).replaceAll('\\', '/')}"`, '-d', `"${classes.replaceAll('\\', '/')}"`, ...files.map(f => `"${f.replaceAll('\\', '/')}"`)].join('\n'));
  execFileSync(path.join(jdk, 'javac.exe'), [`@${args}`], { stdio: 'pipe' });
  const result = execFileSync(path.join(jdk, 'java.exe'), ['-cp', [classes, jar, mixins].join(path.delimiter), 'NetworkStandbyTest', version], { encoding: 'utf8' });
  assert.match(result, /PASS: server gate/);
});

for (const version of ['1.21.1', '26.2']) test(`native standby ${version}: mixin targets exist in Minecraft`, t => {
  const base = version === '1.21.1' ? path.join(root, 'scratch/standby-native21') : game;
  const libraries = path.join(base, 'loader/neoforge/libraries');
  const jars = version === '1.21.1'
    ? [path.join(libraries, 'net/neoforged/neoforge/21.1.264/neoforge-21.1.264-client.jar'), path.join(libraries, 'net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar')]
    : [path.join(libraries, 'net/neoforged/minecraft-client-patched/26.2.0.93/minecraft-client-patched-26.2.0.93.jar')];
  if (jars.some(file => !fs.existsSync(file))) return t.skip('Native Minecraft dependencies are not installed.');
  const targets = [
    ['net.minecraft.network.Connection', version === '1.21.1' ? '(Lnet/minecraft/network/protocol/Packet;Lnet/minecraft/network/PacketSendListener;Z)V' : '(Lnet/minecraft/network/protocol/Packet;Lio/netty/channel/ChannelFutureListener;Z)V'],
    ['net.minecraft.server.network.PlayerChunkSender', '(Lnet/minecraft/server/level/ServerPlayer;)V'],
    ['net.minecraft.client.multiplayer.ClientLevel', '(Ljava/util/function/BooleanSupplier;)V'],
    ['net.minecraft.server.network.ServerGamePacketListenerImpl', 'sendPlayerChatMessage'],
    ['net.minecraft.client.particle.ParticleEngine', 'clearParticles'],
  ];
  for (const [name, signature] of targets) {
    const output = execFileSync(path.join(jdk, 'javap.exe'), ['-p', '-s', '-classpath', jars.join(path.delimiter), name], { encoding: 'utf8' });
    assert.ok(output.includes(signature), `${name} must expose ${signature}`);
  }
});
