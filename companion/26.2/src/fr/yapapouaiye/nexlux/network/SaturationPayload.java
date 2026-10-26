package fr.yapapouaiye.nexlux.network;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

public record SaturationPayload(int entityId, float saturation) implements CustomPacketPayload {
    public static final Type<SaturationPayload> TYPE = new Type<>(Identifier.fromNamespaceAndPath("nexlux", "saturation"));
    public static final StreamCodec<RegistryFriendlyByteBuf, SaturationPayload> CODEC = new StreamCodec<>() {
        public SaturationPayload decode(RegistryFriendlyByteBuf buffer) {
            int entityId = buffer.readVarInt();
            float value = buffer.readFloat();
            if (!Float.isFinite(value) || value < 0 || value > 20) throw new IllegalArgumentException("Invalid saturation");
            return new SaturationPayload(entityId, value);
        }
        public void encode(RegistryFriendlyByteBuf buffer, SaturationPayload value) {
            buffer.writeVarInt(value.entityId());
            buffer.writeFloat(value.saturation());
        }
    };
    @Override public Type<SaturationPayload> type() { return TYPE; }
}
