package fr.yapapouaiye.nexlux.standby.mixin;
import fr.yapapouaiye.nexlux.standby.StandbyServer;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ServerGamePacketListenerImpl.class)
public abstract class StandbyServerChatMixin {
    @Inject(method = "sendPlayerChatMessage", at = @At("HEAD"), cancellable = true)
    private void nexlux$skipSleepingChat(CallbackInfo ci) {
        // Do not create signed-chat acknowledgement obligations for hidden messages.
        if (StandbyServer.sleeping(((ServerGamePacketListenerImpl)(Object)this).player)) ci.cancel();
    }
}
