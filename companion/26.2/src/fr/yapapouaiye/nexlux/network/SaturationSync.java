package fr.yapapouaiye.nexlux.network;

import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;

/** Authoritative values only. Optional channel keeps unmodified servers/clients compatible. */
public final class SaturationSync {
    private record Sent(float value, int tick, java.lang.ref.WeakReference<Object> connection) {}
    private static final Map<ServerPlayer, Sent> LAST = new WeakHashMap<>();
    private SaturationSync() {}

    @SubscribeEvent public static void tick(PlayerTickEvent.Post event) {
        if (!(event.getEntity() instanceof ServerPlayer player) || player.connection == null
                || !player.connection.hasChannel(SaturationPayload.TYPE)) return;
        float value = player.getFoodData().getSaturationLevel();
        if (!Float.isFinite(value) || value < 0 || value > 20) return;
        Sent last = LAST.get(player);
        if (last == null || last.connection.get() != player.connection || Float.compare(last.value, value) != 0
                || player.tickCount - last.tick >= 100) {
            PacketDistributor.sendToPlayer(player, new SaturationPayload(player.getId(), value));
            LAST.put(player, new Sent(value, player.tickCount, new java.lang.ref.WeakReference<>(player.connection)));
        }
    }
}
