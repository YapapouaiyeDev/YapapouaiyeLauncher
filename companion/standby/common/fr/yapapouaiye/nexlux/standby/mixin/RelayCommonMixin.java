package fr.yapapouaiye.nexlux.standby.mixin;
import fr.yapapouaiye.nexlux.standby.RelayClient;
import net.minecraft.client.multiplayer.ClientCommonPacketListenerImpl;
import net.minecraft.network.Connection;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientCommonPacketListenerImpl.class)
public abstract class RelayCommonMixin {
    @Shadow @Final protected Connection connection;
    @Inject(method = "onDisconnect", at = @At("TAIL"))
    private void nexlux$disconnected(CallbackInfo callback) { RelayClient.disconnected(connection); }
}
