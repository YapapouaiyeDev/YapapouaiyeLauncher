package fr.yapapouaiye.nexlux.standby;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.HandlerThread;

@EventBusSubscriber(modid = "nexlux")
public final class RelayRegistration {
    @SubscribeEvent public static void register(RegisterPayloadHandlersEvent event) {
        // In 26.2 the three-argument overload registers only the server handler.
        // Both handlers must be supplied explicitly, otherwise client startup
        // rejects this channel before Minecraft opens.
        event.registrar("1").optional().executesOn(HandlerThread.MAIN).playBidirectional(
            RelayPayload.TYPE, RelayPayload.CODEC,
            (message, context) -> {
                if (context.player() instanceof ServerPlayer player) RelayServer.receive(player, message);
            },
            (message, context) -> RelayClient.receive(message));
    }
}
