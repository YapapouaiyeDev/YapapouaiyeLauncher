// Execute the shipped relay classes against a small server/client boundary
// fixture. Real Minecraft/NeoForge signatures are also checked separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const game = process.env.NEXLUX_GAME_ROOT || path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft');
const jdk = process.env.NEXLUX_JDK || path.join(game, 'runtime/java-runtime-epsilon/bin');
const sources = {
  'net/minecraft/network/protocol/Packet.java': 'package net.minecraft.network.protocol; public interface Packet<T> {}',
  'net/minecraft/network/protocol/common/custom/CustomPacketPayload.java': 'package net.minecraft.network.protocol.common.custom; public interface CustomPacketPayload {}',
  'fr/yapapouaiye/nexlux/standby/RelayPayload.java': `package fr.yapapouaiye.nexlux.standby; import java.util.UUID;
    public record RelayPayload(int operation,UUID request) implements net.minecraft.network.protocol.common.custom.CustomPacketPayload {
      public static final int CAPABILITIES=1,RESYNC=2,BEGIN=3,END=4,BACKGROUND=5,DETACH=6,EXIT=7,FOCUS=8,ERROR=9,HELLO=10;
      public static final UUID NONE=new UUID(0,0);
    }`,
  'fr/yapapouaiye/nexlux/standby/RelayPlatform.java': `package fr.yapapouaiye.nexlux.standby;
    import net.minecraft.server.level.*; import net.minecraft.server.players.*;
    public class RelayPlatform {
      public static void releaseInput(ServerPlayer p) { p.inputReleased++; }
      public static void sendLogin(ServerPlayer p,PlayerList list,ServerLevel level) { p.connection.sent.add("fresh-login"); }
      public static void sendRecipes(ServerPlayer p,net.minecraft.server.MinecraftServer server) { p.connection.sent.add("recipes"); }
    }`,
  'net/minecraft/network/chat/LastSeenMessagesValidator.java': 'package net.minecraft.network.chat; public class LastSeenMessagesValidator { public LastSeenMessagesValidator(int capacity) {} }',
  'net/minecraft/network/chat/MessageSignatureCache.java': 'package net.minecraft.network.chat; public class MessageSignatureCache { public static MessageSignatureCache createDefault() { return new MessageSignatureCache(); } }',
  'net/minecraft/server/ServerScoreboard.java': 'package net.minecraft.server; public class ServerScoreboard {}',
  'net/minecraft/world/level/Level.java': 'package net.minecraft.world.level; public class Level {}',
  'net/minecraft/server/MinecraftServer.java': 'package net.minecraft.server; public class MinecraftServer { public final net.minecraft.server.players.PlayerList players=new net.minecraft.server.players.PlayerList(); public net.minecraft.server.players.PlayerList getPlayerList() { return players; } }',
  'net/minecraft/server/level/ServerLevel.java': `package net.minecraft.server.level; public class ServerLevel extends net.minecraft.world.level.Level {
    public final net.minecraft.server.MinecraftServer server=new net.minecraft.server.MinecraftServer();
    public final ServerChunkCache chunks=new ServerChunkCache(); public net.minecraft.server.MinecraftServer getServer() { return server; }
    public ServerChunkCache getChunkSource() { return chunks; }
    public net.minecraft.world.Difficulty getDifficulty() { return net.minecraft.world.Difficulty.NORMAL; }
    public net.minecraft.world.level.storage.LevelData getLevelData() { return new net.minecraft.world.level.storage.LevelData() {}; }
    public net.minecraft.server.ServerScoreboard getScoreboard() { return new net.minecraft.server.ServerScoreboard(); }
  }`,
  'net/minecraft/world/Difficulty.java': 'package net.minecraft.world; public enum Difficulty { NORMAL }',
  'net/minecraft/world/level/storage/LevelData.java': 'package net.minecraft.world.level.storage; public interface LevelData { public default boolean isDifficultyLocked() { return false; } }',
  'net/minecraft/world/entity/Entity.java': 'package net.minecraft.world.entity; public class Entity {}',
  'net/minecraft/world/entity/player/Player.java': 'package net.minecraft.world.entity.player; public class Player extends net.minecraft.world.entity.Entity { public java.util.UUID getUUID() { return new java.util.UUID(0,123); } }',
  'net/minecraft/server/level/ServerChunkCache.java': `package net.minecraft.server.level; public class ServerChunkCache {
    public int removed,added; public void removeEntity(net.minecraft.world.entity.Entity p) { removed++; }
    public void addEntity(net.minecraft.world.entity.Entity p) { added++; }
  }`,
  'net/minecraft/server/players/PlayerList.java': `package net.minecraft.server.players;
    public class PlayerList implements fr.yapapouaiye.nexlux.standby.mixin.RelayPlayerListMixin {
      public net.minecraft.server.level.ServerPlayer player; public int logins=1,logouts;
      public java.util.List<net.minecraft.server.level.ServerPlayer> getPlayers() { return java.util.List.of(player); }
      public void sendPlayerPermissionLevel(net.minecraft.server.level.ServerPlayer p) {}
      public void sendLevelInfo(net.minecraft.server.level.ServerPlayer p,net.minecraft.server.level.ServerLevel level) {}
      public void sendAllPlayerInfo(net.minecraft.server.level.ServerPlayer p) {}
      public void nexlux$sendScoreboard(net.minecraft.server.ServerScoreboard score,net.minecraft.server.level.ServerPlayer p) {}
    }`,
  'net/minecraft/server/network/ServerGamePacketListenerImpl.java': `package net.minecraft.server.network;
    public class ServerGamePacketListenerImpl implements fr.yapapouaiye.nexlux.standby.mixin.RelayChatMixin,net.neoforged.neoforge.common.extensions.ICommonPacketListener {
      public final java.util.List<Object> sent=new java.util.ArrayList<>(); public int seenReset,signatureReset;
      public void send(net.minecraft.network.protocol.Packet<?> packet) { sent.add(packet); }
      public void teleport(double x,double y,double z,float yaw,float pitch) { if(x!=1||y!=64||z!=2||yaw!=3||pitch!=4) throw new AssertionError("position changed"); }
      public void nexlux$resetSeenMessages(net.minecraft.network.chat.LastSeenMessagesValidator value) { seenReset++; }
      public void nexlux$resetSignatureCache(net.minecraft.network.chat.MessageSignatureCache value) { signatureReset++; }
    }`,
  'net/minecraft/stats/ServerRecipeBook.java': 'package net.minecraft.stats; public class ServerRecipeBook { public void sendInitialRecipeBook(net.minecraft.server.level.ServerPlayer p) {} }',
  'net/minecraft/stats/ServerStatsCounter.java': 'package net.minecraft.stats; public class ServerStatsCounter { public void markAllDirty() {} }',
  'net/minecraft/world/inventory/InventoryMenu.java': 'package net.minecraft.world.inventory; public class InventoryMenu { public int items=123; public void sendAllDataToRemote() {} }',
  'net/minecraft/world/entity/ai/attributes/AttributeMap.java': 'package net.minecraft.world.entity.ai.attributes; public class AttributeMap { public java.util.Collection<Object> getSyncableAttributes() { return java.util.List.of(); } }',
  'net/minecraft/world/effect/MobEffectInstance.java': 'package net.minecraft.world.effect; public class MobEffectInstance {}',
  'net/minecraft/server/level/ServerPlayer.java': `package net.minecraft.server.level;
    public class ServerPlayer extends net.minecraft.world.entity.player.Player {
      public final net.minecraft.server.network.ServerGamePacketListenerImpl connection=new net.minecraft.server.network.ServerGamePacketListenerImpl();
      public final ServerLevel world=new ServerLevel(); public final net.minecraft.world.inventory.InventoryMenu inventoryMenu=new net.minecraft.world.inventory.InventoryMenu();
      public int experienceLevel=10,totalExperience=100,inputReleased; public float experienceProgress=.5f;
      public net.minecraft.world.level.Level level() { return world; } public int getId() { return 7; }
      public void closeContainer() {} public void stopUsingItem() {} public void setShiftKeyDown(boolean v) {} public void setSprinting(boolean v) {}
      public void onUpdateAbilities() {} public net.minecraft.stats.ServerRecipeBook getRecipeBook() { return new net.minecraft.stats.ServerRecipeBook(); }
      public net.minecraft.stats.ServerStatsCounter getStats() { return new net.minecraft.stats.ServerStatsCounter(); }
      public net.minecraft.world.entity.ai.attributes.AttributeMap getAttributes() { return new net.minecraft.world.entity.ai.attributes.AttributeMap(); }
      public java.util.Collection<net.minecraft.world.effect.MobEffectInstance> getActiveEffects() { return java.util.List.of(); }
      public double getX() { return 1; } public double getY() { return 64; } public double getZ() { return 2; }
      public float getYRot() { return 3; } public float getXRot() { return 4; }
    }`,
  'net/neoforged/neoforge/network/PacketDistributor.java': `package net.neoforged.neoforge.network; public class PacketDistributor {
    public static void sendToPlayer(net.minecraft.server.level.ServerPlayer p,net.minecraft.network.protocol.common.custom.CustomPacketPayload message,net.minecraft.network.protocol.common.custom.CustomPacketPayload... rest) { p.connection.sent.add(message); }
  }`,
  'net/neoforged/neoforge/common/extensions/ICommonPacketListener.java': 'package net.neoforged.neoforge.common.extensions; public interface ICommonPacketListener {}',
  'net/neoforged/neoforge/event/entity/player/PlayerEvent.java': `package net.neoforged.neoforge.event.entity.player; public class PlayerEvent {
    public net.minecraft.world.entity.player.Player getEntity() { return null; }
    public static class PlayerLoggedInEvent extends PlayerEvent {} public static class PlayerLoggedOutEvent extends PlayerEvent {}
  }`,
  'net/minecraft/network/Connection.java': `package net.minecraft.network; public class Connection {
    final java.net.SocketAddress address; public Connection(java.net.SocketAddress address) { this.address=address; }
    public java.net.SocketAddress getRemoteAddress() { return address; }
    public void send(net.minecraft.network.protocol.Packet<?> packet) {}
  }`,
  'net/minecraft/client/multiplayer/ClientPacketListener.java': 'package net.minecraft.client.multiplayer; public class ClientPacketListener { final net.minecraft.network.Connection connection; public ClientPacketListener(net.minecraft.network.Connection connection) { this.connection=connection; } public net.minecraft.network.Connection getConnection() { return connection; } }',
  'net/minecraft/client/gui/screens/Screen.java': 'package net.minecraft.client.gui.screens; public class Screen {}',
  'net/minecraft/client/Minecraft.java': `package net.minecraft.client; public class Minecraft {
    static final Minecraft INSTANCE=new Minecraft(); public int stops; public net.minecraft.client.multiplayer.ClientPacketListener connection;
    public static Minecraft getInstance() { return INSTANCE; } public net.minecraft.client.multiplayer.ClientPacketListener getConnection() { return connection; }
    public void stop() { stops++; } public void execute(Runnable task) { task.run(); }
  }`,
  'net/minecraft/network/protocol/common/ServerboundCustomPayloadPacket.java': 'package net.minecraft.network.protocol.common; public class ServerboundCustomPayloadPacket implements net.minecraft.network.protocol.Packet<Object> { public ServerboundCustomPayloadPacket(net.minecraft.network.protocol.common.custom.CustomPacketPayload payload) {} }',
  'fr/yapapouaiye/nexlux/standby/StandbyClient.java': 'package fr.yapapouaiye.nexlux.standby; public class StandbyClient { public static void enter() {} public static void resume() {} }',
  'fr/yapapouaiye/nexlux/standby/StandbyPlatform.java': 'package fr.yapapouaiye.nexlux.standby; public class StandbyPlatform { public static void setScreen(net.minecraft.client.gui.screens.Screen screen) {} public static void focus() {} }',
  'RelayTest.java': `import fr.yapapouaiye.nexlux.standby.*; import net.minecraft.server.level.*; import net.minecraft.network.*; import java.util.*;
    public class RelayTest {
      static void check(boolean value,String reason) { if(!value)throw new AssertionError(reason); }
      public static void main(String[] args) throws Exception {
        var player=new ServerPlayer(); player.world.server.players.player=player; var original=player.connection;
        var nonce=UUID.randomUUID(); RelayServer.receive(player,new RelayPayload(RelayPayload.RESYNC,nonce));
        check(player.connection==original,"connection replaced"); check(player.world.server.players.logins==1 && player.world.server.players.logouts==0,"login/logout occurred");
        check(player.inventoryMenu.items==123 && player.experienceLevel==10 && player.totalExperience==100,"player state changed");
        check(player.world.chunks.removed==1 && player.world.chunks.added==1,"world tracking not rebuilt");
        check(original.seenReset==1 && original.signatureReset==1,"fresh client chat state not rebuilt");
        check(original.sent.get(0).equals(new RelayPayload(RelayPayload.BEGIN,nonce)),"missing begin marker");
        check(original.sent.get(1).equals("fresh-login"),"missing fresh world initialization");
        check(original.sent.get(original.sent.size()-1).equals(new RelayPayload(RelayPayload.END,nonce)),"missing end marker");
        RelayServer.receive(player,new RelayPayload(RelayPayload.RESYNC,UUID.randomUUID()));
        check(((RelayPayload)original.sent.get(original.sent.size()-1)).operation()==RelayPayload.ERROR,"refresh flood not limited");
        check(player.world.chunks.removed==1,"rate limit changed player tracking");
        RelayServer.receive(player,new RelayPayload(RelayPayload.BACKGROUND,RelayPayload.NONE)); check(player.inputReleased==1,"input not released");
        var local=new Connection(new java.net.InetSocketAddress("127.0.0.1",12345));
        var remote=new Connection(new java.net.InetSocketAddress("192.0.2.1",12345));
        String challenge="nexlux:relay_auth/00112233445566778899aabbccddeeff";
        check(RelayClient.proof(remote,challenge)==null,"secret used on remote server");
        check(RelayClient.proof(new Connection(new java.net.InetSocketAddress("127.0.0.1",12346)),challenge)==null,"secret used on another local service");
        check(RelayClient.proof(local,"invalid")==null,"invalid challenge accepted");
        String proof=java.util.HexFormat.of().formatHex(RelayClient.proof(local,challenge));
        var mc=net.minecraft.client.Minecraft.getInstance(); mc.connection=new net.minecraft.client.multiplayer.ClientPacketListener(remote);
        RelayClient.receive(new RelayPayload(RelayPayload.EXIT,RelayPayload.NONE)); check(mc.stops==0,"remote exit allowed");
        mc.connection=new net.minecraft.client.multiplayer.ClientPacketListener(local);
        RelayClient.receive(new RelayPayload(RelayPayload.CAPABILITIES,RelayPayload.NONE)); check(RelayClient.available(),"local capability missing");
        RelayClient.disconnected(local); check(mc.stops==0,"unexpected disconnect hides error screen");
        check(!RelayClient.available(),"stale capability after disconnect");
        RelayClient.receive(new RelayPayload(RelayPayload.EXIT,RelayPayload.NONE));
        check(mc.stops==1,"graceful local exit missing"); System.out.println("PASS "+proof);
      }
    }`,
};
for (const [name, parameters] of [
  ['ClientboundChangeDifficultyPacket', 'net.minecraft.world.Difficulty value,boolean locked'],
  ['ClientboundSetExperiencePacket', 'float progress,int total,int level'],
  ['ClientboundUpdateAttributesPacket', 'int id,java.util.Collection<?> values'],
  ['ClientboundUpdateMobEffectPacket', 'int id,net.minecraft.world.effect.MobEffectInstance effect,boolean blend'],
]) sources[`net/minecraft/network/protocol/game/${name}.java`] = `package net.minecraft.network.protocol.game; public class ${name} implements net.minecraft.network.protocol.Packet<Object> { public ${name}(${parameters}) {} }`;
sources['net/minecraft/network/protocol/game/ClientboundPlayerInfoUpdatePacket.java'] = 'package net.minecraft.network.protocol.game; public class ClientboundPlayerInfoUpdatePacket implements net.minecraft.network.protocol.Packet<Object> { public static ClientboundPlayerInfoUpdatePacket createPlayerInitializing(java.util.Collection<net.minecraft.server.level.ServerPlayer> players) { return new ClientboundPlayerInfoUpdatePacket(); } }';

for (const version of ['1.21.1', '26.2']) test(`shipped relay ${version}: player/connection preserved, fresh client state, auth isolation and graceful exit`, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-relay-test-'));
  t.after(() => { const resolved = path.resolve(temp); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('nexlux-relay-test-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const jar = path.join(root, 'mods', version === '1.21.1' ? 'nexlux-1.1.0.jar' : 'nexlux-26.2.jar');
  const definition = JSON.parse(fs.readFileSync(path.join(game, 'versions', version, `${version}.json`)));
  const gsonFile = definition.libraries.find(lib => lib.name.startsWith('com.google.code.gson:gson:')).downloads.artifact.path;
  const gson = path.join(game, 'libraries', gsonFile);
  const classpath = [jar, gson];
  const idClass = version === '1.21.1' ? 'ResourceLocation' : 'Identifier';
  const localSources = { ...sources,
    [`net/minecraft/resources/${idClass}.java`]: `package net.minecraft.resources; public class ${idClass} {}`,
    'net/minecraft/network/protocol/common/custom/CustomPacketPayload.java': `package net.minecraft.network.protocol.common.custom; public interface CustomPacketPayload { public static class Type<T> { public net.minecraft.resources.${idClass} id() { return null; } } }`,
    'net/neoforged/neoforge/network/registration/NetworkRegistry.java': `package net.neoforged.neoforge.network.registration; public class NetworkRegistry { public static boolean hasChannel(net.neoforged.neoforge.common.extensions.ICommonPacketListener listener,net.minecraft.resources.${idClass} id) { return false; } }`,
  };
  localSources['fr/yapapouaiye/nexlux/standby/RelayPayload.java'] = localSources['fr/yapapouaiye/nexlux/standby/RelayPayload.java'].replace('public static final UUID NONE=', 'public static final net.minecraft.network.protocol.common.custom.CustomPacketPayload.Type<RelayPayload> TYPE=new net.minecraft.network.protocol.common.custom.CustomPacketPayload.Type<>(); public static final UUID NONE=');
  if (version === '26.2') localSources['net/minecraft/server/level/ServerPlayer.java'] = localSources['net/minecraft/server/level/ServerPlayer.java'].replace('public net.minecraft.world.level.Level level()', 'public ServerLevel level()');
  const files = [];
  for (const [name, content] of Object.entries(localSources)) {
    const file = path.join(temp, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); files.push(file);
  }
  const classes = path.join(temp, 'classes'); fs.mkdirSync(classes);
  const argsFile = path.join(temp, 'javac.args');
  fs.writeFileSync(argsFile, ['-proc:none', '-encoding', 'UTF-8', '-classpath', `"${classpath.join(path.delimiter).replaceAll('\\', '/')}"`, '-d', `"${classes.replaceAll('\\', '/')}"`, ...files.map(file => `"${file.replaceAll('\\', '/')}"`)].join('\n'));
  execFileSync(path.join(jdk, 'javac.exe'), [`@${argsFile}`], { stdio: 'pipe' });
  const secret = crypto.randomBytes(32).toString('hex');
  const controlFile = path.join(temp, 'control.json'); fs.writeFileSync(controlFile, JSON.stringify({ secret, port: 12345 }), { mode: 0o600 });
  const result = execFileSync(path.join(jdk, 'java.exe'), [`-Dnexlux.relayControl=${controlFile}`, '-cp', [classes, ...classpath].join(path.delimiter), 'RelayTest'], { encoding: 'utf8' });
  const proof = crypto.createHmac('sha256', secret).update('nexlux:relay_auth/00112233445566778899aabbccddeeff', 'ascii').digest('hex');
  assert.match(result, new RegExp('PASS ' + proof));
  const actualGame = version === '1.21.1' ? path.join(game, 'loader/neoforge/libraries/net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar') : path.join(game, 'versions/26.2/26.2.jar');
  const describe = name => execFileSync(path.join(jdk, 'javap.exe'), ['-p', '-classpath', actualGame, name], { encoding: 'utf8' });
  assert.match(describe('net.minecraft.server.players.PlayerList'), /protected void updateEntireScoreboard/);
  const listener = describe('net.minecraft.server.network.ServerGamePacketListenerImpl');
  assert.match(listener, /LastSeenMessagesValidator lastSeenMessages;/); assert.match(listener, /MessageSignatureCache messageSignatureCache;/);
  for (const name of ['ClientHandshakePacketListenerImpl', 'ClientCommonPacketListenerImpl']) assert.match(describe('net.minecraft.client.multiplayer.' + name), /void onDisconnect\(net.minecraft.network.DisconnectionDetails\)/);
});
