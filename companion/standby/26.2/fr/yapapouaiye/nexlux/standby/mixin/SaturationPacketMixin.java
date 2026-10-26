package fr.yapapouaiye.nexlux.standby.mixin;

import fr.yapapouaiye.nexlux.client.SaturationState;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundSetHealthPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientPacketListener.class)
public abstract class SaturationPacketMixin {
    // TAIL runs after vanilla's game-thread check and player food update.
    @Inject(method = "handleSetHealth", at = @At("TAIL"))
    private void nexlux$receiveSaturation(ClientboundSetHealthPacket packet, CallbackInfo ci) {
        SaturationState.receiveVanilla(packet.getSaturation());
    }
}
