package fr.yapapouaiye.nexlux.standby.mixin;

import com.mojang.blaze3d.pipeline.RenderPipeline;
import fr.yapapouaiye.nexlux.client.SaturationOverlay;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Hud.class)
public abstract class SaturationHudMixin {
    @Unique private Player nexlux$heartPlayer;
    @Unique private int nexlux$heartIndex;

    @Redirect(method = "extractFood", at = @At(value = "INVOKE", target =
        "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blitSprite(Lcom/mojang/blaze3d/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIII)V"))
    private void nexlux$food(GuiGraphicsExtractor gui, RenderPipeline pipeline, Identifier sprite, int x, int y, int width, int height,
                            GuiGraphicsExtractor originalGui, Player player, int baseY, int right) {
        gui.blitSprite(pipeline, sprite, x, y, width, height);
        int index = (right - x - 9) / 8;
        if (sprite.getPath().equals("hud/food_empty") || sprite.getPath().equals("hud/food_empty_hunger")) {
            SaturationOverlay.foodPreview(gui, player, index, x, y);
            if (player.getFoodData().getFoodLevel() > index * 2) return;
        }
        // Paint the closed contour once, after the last native sprite in this slot.
        SaturationOverlay.saturation(gui, player, index, x, y);
    }

    @Inject(method = "extractHearts", at = @At("HEAD"))
    private void nexlux$startHearts(GuiGraphicsExtractor gui, Player player, int left, int y, int spacing, int regeneration,
                                   float maxHealth, int health, int displayHealth, int absorption, boolean blinking, CallbackInfo ci) {
        nexlux$heartPlayer = player;
        nexlux$heartIndex = (int)Math.ceil(maxHealth / 2) + (int)Math.ceil(absorption / 2.0) - 1;
    }

    @Inject(method = "extractHeart", at = @At("TAIL"))
    private void nexlux$heart(GuiGraphicsExtractor gui, Hud.HeartType type, int x, int y,
                             boolean hardcore, boolean blinking, boolean half, CallbackInfo ci) {
        if (type == Hud.HeartType.CONTAINER && nexlux$heartPlayer != null) {
            SaturationOverlay.heart(gui, nexlux$heartPlayer, nexlux$heartIndex--, x, y, hardcore);
        }
    }

    @Inject(method = "extractHearts", at = @At("RETURN"))
    private void nexlux$finishHearts(GuiGraphicsExtractor gui, Player player, int left, int y, int spacing, int regeneration,
                                    float maxHealth, int health, int displayHealth, int absorption, boolean blinking, CallbackInfo ci) {
        nexlux$heartPlayer = null;
    }
}
