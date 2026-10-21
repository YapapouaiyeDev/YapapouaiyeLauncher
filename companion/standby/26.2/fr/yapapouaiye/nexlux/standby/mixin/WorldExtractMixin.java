package fr.yapapouaiye.nexlux.standby.mixin;

import fr.yapapouaiye.nexlux.standby.StandbyClient;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(GameRenderer.class)
public abstract class WorldExtractMixin {
    @ModifyVariable(method = "extract(Lnet/minecraft/client/DeltaTracker;Z)V", at = @At("HEAD"), argsOnly = true, ordinal = 0, remap = false)
    private boolean nexlux$extractWorld(boolean renderWorld) {
        return renderWorld && !StandbyClient.isActive();
    }
}
