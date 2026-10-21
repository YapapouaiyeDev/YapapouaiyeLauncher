package fr.yapapouaiye.nexlux.standby.mixin;
import fr.yapapouaiye.nexlux.standby.StandbyServer;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Coerce;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Connection.class)
public abstract class StandbyConnectionMixin {
    @Inject(method = "send(Lnet/minecraft/network/protocol/Packet;Lnet/minecraft/network/PacketSendListener;Z)V", at = @At("HEAD"), cancellable = true)
    private void nexlux$gateWorldPackets(Packet<?> packet, @Coerce Object listener, boolean flush, CallbackInfo ci) {
        if (StandbyServer.suppress((Connection)(Object)this, packet)) ci.cancel();
    }
}
