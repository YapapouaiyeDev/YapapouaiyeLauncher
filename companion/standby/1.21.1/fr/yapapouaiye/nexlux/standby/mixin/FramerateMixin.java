package fr.yapapouaiye.nexlux.standby.mixin;

import fr.yapapouaiye.nexlux.standby.StandbyClient;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Minecraft.class)
public abstract class FramerateMixin {
    @Inject(method = "getFramerateLimit()I", at = @At("RETURN"), cancellable = true, remap = false)
    private void nexlux$standbyFrameLimit(CallbackInfoReturnable<Integer> result) {
        if (StandbyClient.isActive()) {
            int current = result.getReturnValueI();
            result.setReturnValue(current > 0 ? Math.min(current, StandbyClient.FRAME_LIMIT) : StandbyClient.FRAME_LIMIT);
        }
    }
}
