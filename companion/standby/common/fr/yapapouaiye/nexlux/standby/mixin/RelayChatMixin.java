package fr.yapapouaiye.nexlux.standby.mixin;
import net.minecraft.network.chat.LastSeenMessagesValidator;
import net.minecraft.network.chat.MessageSignatureCache;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(ServerGamePacketListenerImpl.class)
public interface RelayChatMixin {
    @Mutable @Accessor("lastSeenMessages")
    void nexlux$resetSeenMessages(LastSeenMessagesValidator validator);
    @Mutable @Accessor("messageSignatureCache")
    void nexlux$resetSignatureCache(MessageSignatureCache cache);
}
