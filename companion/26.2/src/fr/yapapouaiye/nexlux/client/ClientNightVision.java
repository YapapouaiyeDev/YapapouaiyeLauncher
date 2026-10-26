package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;

/** Own only the synthetic effect: normal server potions must retain their duration. */
public final class ClientNightVision {
    private static LocalPlayer owner;
    private static MobEffectInstance synthetic;
    private ClientNightVision() {}
    public static void update(boolean enabled) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player != owner) { owner = player; synthetic = null; }
        if (player == null) return;
        MobEffectInstance current = player.getEffect(MobEffects.NIGHT_VISION);
        if (current != synthetic) synthetic = null;
        if (enabled && (current == null || current == synthetic && current.getDuration() < 60000)) {
            synthetic = new MobEffectInstance(MobEffects.NIGHT_VISION, 999999, 0, false, false, false);
            player.addEffect(synthetic);
        } else if (!enabled && synthetic != null && current == synthetic) {
            player.removeEffect(MobEffects.NIGHT_VISION);
            synthetic = null;
        }
    }
}
