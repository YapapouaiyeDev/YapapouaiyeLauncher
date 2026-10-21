package fr.yapapouaiye.nexlux.standby;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.HandlerThread;

@EventBusSubscriber(modid = "nexlux", bus = EventBusSubscriber.Bus.MOD)
public final class RelayRegistration {
    @SubscribeEvent public static void register(RegisterPayloadHandlersEvent event) {
        event.registrar("1").optional().executesOn(HandlerThread.MAIN).playBidirectional(RelayPayload.TYPE, RelayPayload.CODEC, (message, context) -> {
            if (context.flow() == PacketFlow.SERVERBOUND && context.player() instanceof ServerPlayer player) RelayServer.receive(player, message);
            else if (context.flow() == PacketFlow.CLIENTBOUND) RelayClient.receive(message);
        });
    }
}
