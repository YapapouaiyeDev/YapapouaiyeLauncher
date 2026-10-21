package fr.yapapouaiye.nexlux.standby;

import java.util.UUID;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Small, versioned control messages. No credentials, world or player IDs. */
public record RelayPayload(int operation, UUID request) implements CustomPacketPayload {
    public static final int VERSION = 1;
    public static final int CAPABILITIES = 1, RESYNC = 2, BEGIN = 3, END = 4,
        BACKGROUND = 5, DETACH = 6, EXIT = 7, FOCUS = 8, ERROR = 9, HELLO = 10;
    public static final UUID NONE = new UUID(0, 0);
    public static final Type<RelayPayload> TYPE = new Type<>(RelayPlatform.identifier("nexlux:relay_session"));
    public static final StreamCodec<RegistryFriendlyByteBuf, RelayPayload> CODEC = new StreamCodec<>() {
        public RelayPayload decode(RegistryFriendlyByteBuf buffer) {
            if (buffer.readVarInt() != VERSION) throw new IllegalArgumentException("Unsupported NexLux relay version");
            int op = buffer.readVarInt();
            if (op < CAPABILITIES || op > HELLO) throw new IllegalArgumentException("Unknown NexLux relay operation");
            return new RelayPayload(op, buffer.readUUID());
        }
        public void encode(RegistryFriendlyByteBuf buffer, RelayPayload payload) {
            buffer.writeVarInt(VERSION).writeVarInt(payload.operation()).writeUUID(payload.request());
        }
    };
    @Override public Type<RelayPayload> type() { return TYPE; }
}
