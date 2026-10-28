/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls.mixin;
import net.minecraft.client.Minecraft;
import net.minecraft.client.OptionInstance;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import fr.yapapouaiye.controls.GammaRange;

/** Client-only: stop invalid FullBright values being rejected/logged on every game tick. */
@Mixin(value=OptionInstance.class,remap=false)
public abstract class GammaOptionMixin {
    @ModifyVariable(method="set(Ljava/lang/Object;)V",at=@At("HEAD"),argsOnly=true,ordinal=0,remap=false)
    private Object yapapouaiye$boundedGamma(Object value) {
        Minecraft mc=Minecraft.getInstance();
        if(value instanceof Double number && mc!=null && mc.options!=null && (Object)this==mc.options.gamma())return GammaRange.bounded(number);
        return value;
    }
}
