package fr.yapapouaiye.nexlux.standby;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.players.PlayerList;
import net.minecraft.network.protocol.game.*;
import net.minecraft.network.chat.LastSeenMessagesValidator;
import net.minecraft.network.chat.MessageSignatureCache;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.registration.NetworkRegistry;
import fr.yapapouaiye.nexlux.standby.mixin.RelayPlayerListMixin;
import fr.yapapouaiye.nexlux.standby.mixin.RelayChatMixin;

/** Rebuilds the graphical client while keeping the existing ServerPlayer and
 * Connection. Never calls placeNewPlayer, respawn, login, logout or teleport to
 * another location. Run only on the server thread, for the packet's sender. */
@EventBusSubscriber(modid = "nexlux")
public final class RelayServer {
    private static final Map<UUID, Long> LAST_REFRESH = new HashMap<>();
    private RelayServer() {}

    @SubscribeEvent public static void joined(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && NetworkRegistry.hasChannel(player.connection, RelayPayload.TYPE.id())) {
            send(player, RelayPayload.CAPABILITIES, RelayPayload.NONE);
        }
    }
    @SubscribeEvent public static void left(PlayerEvent.PlayerLoggedOutEvent event) {
        LAST_REFRESH.remove(event.getEntity().getUUID());
        if (event.getEntity() instanceof ServerPlayer player) StandbyServer.left(player);
    }
    public static void receive(ServerPlayer player, RelayPayload message) {
        if (StandbyServer.receive(player, message)) return;
        if (message.operation() == RelayPayload.HELLO) {
            send(player, RelayPayload.CAPABILITIES, message.request());
        } else if (message.operation() == RelayPayload.BACKGROUND) {
            player.stopUsingItem();
            player.setShiftKeyDown(false);
            player.setSprinting(false);
            RelayPlatform.releaseInput(player);
        } else if (message.operation() == RelayPayload.RESYNC) {
            long now = System.nanoTime();
            Long previous = LAST_REFRESH.get(player.getUUID());
            if (previous != null && now - previous < 2_000_000_000L) {
                send(player, RelayPayload.ERROR, message.request());
                return;
            }
            LAST_REFRESH.put(player.getUUID(), now);
            refresh(player, message.request());
        }
        // EXIT/FOCUS/DETACH are local proxy commands, never server operations.
    }
    private static void send(ServerPlayer player, int operation, UUID request) {
        PacketDistributor.sendToPlayer(player, new RelayPayload(operation, request));
    }
    static void refresh(ServerPlayer player, UUID request) {
        ServerLevel level = (ServerLevel) player.level();
        PlayerList players = level.getServer().getPlayerList();
        player.closeContainer();
        send(player, RelayPayload.BEGIN, request);
        // A fresh graphical process has no previous chat acknowledgement window.
        ((RelayChatMixin) player.connection).nexlux$resetSeenMessages(new LastSeenMessagesValidator(20));
        ((RelayChatMixin) player.connection).nexlux$resetSignatureCache(MessageSignatureCache.createDefault());
        RelayPlatform.sendLogin(player, players, level);
        player.connection.send(new ClientboundChangeDifficultyPacket(level.getDifficulty(), level.getLevelData().isDifficultyLocked()));
        player.onUpdateAbilities();
        RelayPlatform.sendRecipes(player, level.getServer());
        player.getRecipeBook().sendInitialRecipeBook(player);
        player.getStats().markAllDirty();
        players.sendPlayerPermissionLevel(player);
        ((RelayPlayerListMixin) players).nexlux$sendScoreboard(level.getScoreboard(), player);
        player.connection.send(ClientboundPlayerInfoUpdatePacket.createPlayerInitializing(players.getPlayers()));
        players.sendLevelInfo(player, level);
        players.sendAllPlayerInfo(player);
        player.inventoryMenu.sendAllDataToRemote();
        player.connection.send(new ClientboundSetExperiencePacket(player.experienceProgress, player.totalExperience, player.experienceLevel));
        player.connection.send(new ClientboundUpdateAttributesPacket(player.getId(), player.getAttributes().getSyncableAttributes()));
        for (var effect : player.getActiveEffects()) player.connection.send(new ClientboundUpdateMobEffectPacket(player.getId(), effect, false));
        // Re-pair chunk/entity tracking through Minecraft's normal tracker. This
        // is not removal from the level or the player list: the account stays in
        // place with its inventory, UUID and connection unchanged.
        level.getChunkSource().removeEntity(player);
        level.getChunkSource().addEntity(player);
        player.connection.teleport(player.getX(), player.getY(), player.getZ(), player.getYRot(), player.getXRot());
        send(player, RelayPayload.END, request);
    }
}
