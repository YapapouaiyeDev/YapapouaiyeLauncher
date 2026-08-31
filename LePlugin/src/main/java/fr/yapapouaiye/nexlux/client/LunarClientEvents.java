package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.Minecraft;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.ViewportEvent;

/**
 * Écouteurs d'événements client NeoForge pour les fonctionnalités Lunar Client.
 */
public final class LunarClientEvents {

    private LunarClientEvents() {
    }

    @SubscribeEvent
    public static void onClientTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            return;
        }

        // Raccourci Shift Droit pour ouvrir ou fermer le menu Lunar Client
        if (LunarKeyBindings.OPEN_LUNAR_MENU.consumeClick()) {
            if (mc.screen == null) {
                mc.setScreen(new LunarClientScreen());
            } else if (mc.screen instanceof LunarClientScreen) {
                mc.setScreen(null);
            }
        }

        // Raccourci rapide Night Vision
        if (LunarKeyBindings.TOGGLE_NIGHT_VISION.consumeClick()) {
            LunarClientConfig.setNightVision(!LunarClientConfig.isNightVision(), true);
        }

        // Raccourci rapide NoFog
        if (LunarKeyBindings.TOGGLE_NO_FOG.consumeClick()) {
            LunarClientConfig.setNoFog(!LunarClientConfig.isNoFog(), true);
        }

        // Maintien de la vision nocturne sans particules tant qu'elle est activée
        if (LunarClientConfig.isNightVision()) {
            if (!mc.player.hasEffect(net.minecraft.world.effect.MobEffects.NIGHT_VISION)) {
                mc.player.addEffect(new net.minecraft.world.effect.MobEffectInstance(
                        net.minecraft.world.effect.MobEffects.NIGHT_VISION,
                        300,
                        0,
                        false,
                        false,
                        false
                ));
            }
        }
    }

    @SubscribeEvent
    public static void onRenderFog(ViewportEvent.RenderFog event) {
        // Supprime le brouillard si NoFog est activé
        if (LunarClientConfig.isNoFog()) {
            event.setNearPlaneDistance(event.getFarPlaneDistance() * 2.0F);
            event.setFarPlaneDistance(event.getFarPlaneDistance() * 5.0F);
            event.setCanceled(true);
        }
    }
}
