package fr.yapapouaiye.nexlux.standby.mixin;
import fr.yapapouaiye.nexlux.standby.StandbyServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.PlayerChunkSender;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PlayerChunkSender.class)
public abstract class StandbyChunkSenderMixin {
    @Inject(method = "sendNextChunks", at = @At("HEAD"), cancellable = true)
    private void nexlux$skipSleepingChunks(ServerPlayer player, CallbackInfo ci) {
        if (StandbyServer.sleeping(player)) ci.cancel();
    }
}
