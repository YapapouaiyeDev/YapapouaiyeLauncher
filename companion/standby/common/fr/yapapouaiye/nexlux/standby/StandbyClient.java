package fr.yapapouaiye.nexlux.standby;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.client.event.sound.PlaySoundEvent;

/** Lightweight screen; a server handshake optionally freezes the client world. */
@EventBusSubscriber(modid = "nexlux", value = Dist.CLIENT)
public final class StandbyClient {
    public static final int FRAME_LIMIT = 5;
    private static volatile boolean active;
    private static int memoryCleanupTicks;
    private static Object standbyListener;
    private static boolean standbyOnJoin = Boolean.getBoolean("nexlux.standbyOnJoin");

    private StandbyClient() {}
    public static boolean isActive() { return active || StandbyNetworkClient.frozen(); }
    public static void scheduleMemoryCleanup() { memoryCleanupTicks = 40; }

    private static boolean canStandby() {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.player != null && mc.getConnection() != null && !mc.hasSingleplayerServer();
    }

    public static void enter() {
        if (active || !canStandby()) return;
        active = true;
        standbyListener = Minecraft.getInstance().getConnection();
        KeyMapping.releaseAll();
        StandbyPlatform.pauseSounds();
        ((fr.yapapouaiye.nexlux.standby.mixin.StandbyParticlesMixin)Minecraft.getInstance().particleEngine).nexlux$clearParticles();
        // Give the renderer time to finish its last frame before collecting once.
        scheduleMemoryCleanup();
        StandbyNetworkClient.enter();
    }

    public static void resume() {
        standbyListener = null;
        if (!active) return;
        active = false;
        StandbyNetworkClient.resume();
        memoryCleanupTicks = 0;
        Minecraft.getInstance().getSoundManager().resume();
    }

    @SubscribeEvent
    public static void onScreenInit(ScreenEvent.Init.Post event) {
        Screen screen = event.getScreen();
        if (!canStandby() || !(screen instanceof PauseScreen)) return;
        event.addListener(Button.builder(Component.literal("Mettre en veille"), button ->
            StandbyPlatform.setScreen(new StandbyScreen()))
            .bounds(Math.max(4, screen.width - 124), 6, Math.min(120, screen.width - 8), 20).build());
    }

    @SubscribeEvent
    public static void onTick(ClientTickEvent.Post event) {
        StandbyNetworkClient.tick();
        Screen screen = StandbyPlatform.getScreen();
        if (active && (!canStandby() || Minecraft.getInstance().getConnection() != standbyListener || !(screen instanceof StandbyScreen))) {
            resume();
            if (screen instanceof StandbyScreen) StandbyPlatform.setScreen(null);
        }
        if (active && memoryCleanupTicks > 0 && --memoryCleanupTicks == 0) System.gc();
        if (!active && !StandbyNetworkClient.frozen() && screen instanceof StandbyScreen) StandbyPlatform.setScreen(null);
        if (standbyOnJoin && canStandby() && screen == null) {
            standbyOnJoin = false;
            StandbyPlatform.setScreen(new StandbyScreen());
        }
    }

    @SubscribeEvent
    public static void onSound(PlaySoundEvent event) {
        if (isActive()) event.setSound(null);
    }
}
