package fr.yapapouaiye.nexlux.standby.mixin;
import fr.yapapouaiye.nexlux.standby.RelayClient;
import net.minecraft.client.multiplayer.ClientHandshakePacketListenerImpl;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.login.ClientboundCustomQueryPacket;
import net.minecraft.network.protocol.login.ServerboundCustomQueryAnswerPacket;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientHandshakePacketListenerImpl.class)
public abstract class RelayLoginMixin {
    @Shadow @Final private Connection connection;
    @Inject(method = "handleCustomQuery", at = @At("HEAD"), cancellable = true)
    private void nexlux$authenticate(ClientboundCustomQueryPacket packet, CallbackInfo callback) {
        byte[] proof = RelayClient.proof(connection, packet.payload().id().toString());
        if (proof == null) return;
        connection.send(new ServerboundCustomQueryAnswerPacket(packet.transactionId(), buffer -> buffer.writeBytes(proof)));
        callback.cancel();
    }
    @Inject(method = "onDisconnect", at = @At("TAIL"))
    private void nexlux$disconnected(CallbackInfo callback) { RelayClient.disconnected(connection); }
}
