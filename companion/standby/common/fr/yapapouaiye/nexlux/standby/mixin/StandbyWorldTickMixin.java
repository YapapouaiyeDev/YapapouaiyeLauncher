package fr.yapapouaiye.nexlux.standby.mixin;
import fr.yapapouaiye.nexlux.standby.StandbyNetworkClient;
import net.minecraft.client.multiplayer.ClientLevel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientLevel.class)
public abstract class StandbyWorldTickMixin {
    @Inject(method = {"tick", "tickEntities", "animateTick"}, at = @At("HEAD"), cancellable = true)
    private void nexlux$freezeWorld(CallbackInfo ci) {
        if (StandbyNetworkClient.frozen()) ci.cancel();
    }
}
