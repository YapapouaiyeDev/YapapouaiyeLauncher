package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import fr.yapapouaiye.nexlux.network.SaturationPayload;

public final class SaturationState {
    private static LocalPlayer owner;
    private static float value;
    private static long received;
    private static LocalPlayer vanillaOwner;
    private static float vanillaValue;
    private SaturationState() {}
    public static void clear() { owner = vanillaOwner = null; received = 0; }
    /** Vanilla health packets contain a server value, but are not sent on every saturation change. */
    public static void receiveVanilla(float saturation) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null || !Float.isFinite(saturation) || saturation < 0 || saturation > 20) return;
        vanillaOwner = player;
        vanillaValue = saturation;
    }
    public static void receive(SaturationPayload payload) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null || player.getId() != payload.entityId() || !Float.isFinite(payload.saturation())
                || payload.saturation() < 0 || payload.saturation() > 20) return;
        owner = player;
        value = payload.saturation();
        received = System.nanoTime();
    }
    private static boolean authoritative() {
        return owner != null && owner == Minecraft.getInstance().player && System.nanoTime() - received < 10_000_000_000L;
    }
    public static boolean approximate() {
        return !authoritative() && vanillaOwner != null && vanillaOwner == Minecraft.getInstance().player;
    }
    public static float value() {
        return authoritative() ? value : approximate() ? vanillaValue : Float.NaN;
    }
}
