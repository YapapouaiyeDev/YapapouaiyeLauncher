package fr.yapapouaiye.nexlux.standby;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.common.*;
import net.minecraft.network.protocol.game.ClientboundStartConfigurationPacket;
import net.minecraft.network.protocol.game.ClientboundPlayerPositionPacket;
import net.minecraft.network.protocol.game.ClientboundPlayerCombatKillPacket;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.network.PacketDistributor;

/** Gates packets before encoding/writing: no discarded world stream on the client. */
public final class StandbyServer {
    private static final Map<Connection, ServerPlayer> SLEEPING = new ConcurrentHashMap<>();
    private static final Map<UUID, Long> LAST_WAKE = new ConcurrentHashMap<>();
    private StandbyServer() {}
    public static boolean sleeping(ServerPlayer player) { return SLEEPING.get(player.connection.getConnection()) == player; }
    public static void left(ServerPlayer player) {
        SLEEPING.remove(player.connection.getConnection());
        LAST_WAKE.remove(player.getUUID());
    }
    private static void send(ServerPlayer player, int operation, UUID request) {
        PacketDistributor.sendToPlayer(player, new RelayPayload(operation, request));
    }
    public static boolean receive(ServerPlayer player, RelayPayload message) {
        if (!StandbyProtocol.owns(message.request())) return false;
        if (message.request().equals(StandbyProtocol.PROBE) && message.operation() == RelayPayload.HELLO) {
            send(player, RelayPayload.BACKGROUND, StandbyProtocol.PROBE);
        } else if (message.request().equals(StandbyProtocol.ENTER) && message.operation() == RelayPayload.BACKGROUND) {
            long last = LAST_WAKE.getOrDefault(player.getUUID(), 0L);
            if (last != 0 && System.nanoTime() - last < 2_000_000_000L) {
                send(player, RelayPayload.ERROR, StandbyProtocol.ENTER);
                return true;
            }
            player.stopUsingItem(); player.setShiftKeyDown(false); player.setSprinting(false);
            RelayPlatform.releaseInput(player);
            SLEEPING.put(player.connection.getConnection(), player);
            send(player, RelayPayload.BACKGROUND, StandbyProtocol.ENTER);
        } else if (message.request().equals(StandbyProtocol.WAKE) && message.operation() == RelayPayload.RESYNC) {
            if (SLEEPING.remove(player.connection.getConnection(), player)) {
                LAST_WAKE.put(player.getUUID(), System.nanoTime());
                // Open the gate BEFORE sending the current world/player snapshot.
                RelayServer.refresh(player, StandbyProtocol.WAKE);
                if (player.isDeadOrDying()) {
                    player.connection.send(new ClientboundPlayerCombatKillPacket(player.getId(), player.getCombatTracker().getDeathMessage()));
                }
            }
        }
        return true;
    }
    public static boolean suppress(Connection connection, Packet<?> packet) {
        if (!SLEEPING.containsKey(connection)) return false;
        if (packet instanceof ClientboundDisconnectPacket || packet instanceof ClientboundTransferPacket || packet instanceof ClientboundStartConfigurationPacket) {
            SLEEPING.remove(connection);
            return false;
        }
        if (packet instanceof ClientboundKeepAlivePacket || packet instanceof ClientboundPingPacket
                || packet instanceof ClientboundPlayerPositionPacket) return false;
        if (packet instanceof ClientboundCustomPayloadPacket custom && custom.payload() instanceof RelayPayload control
                && StandbyProtocol.owns(control.request())) return false;
        return true;
    }
}
