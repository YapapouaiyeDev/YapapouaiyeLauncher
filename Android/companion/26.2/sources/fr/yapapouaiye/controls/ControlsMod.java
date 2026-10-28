/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.Screen;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;

/** Android-only distribution; no server mod or custom packet is required. */
@Mod(value="yapapouaiye_controls", dist=Dist.CLIENT)
public final class ControlsMod {
    private final DeathChatSession session=new DeathChatSession();
    private final DeathChatSession.Host host=new DeathChatSession.Host() {
        private Minecraft mc() { return Minecraft.getInstance(); }
        public Object player() { return mc().player; }
        public Object connection() { return mc().getConnection(); }
        public Object screen() { return mc().gui.screen(); }
        public boolean dead() { return mc().player!=null && mc().player.isDeadOrDying(); }
        public boolean deathScreen(Object screen) { return screen instanceof DeathScreen; }
        public Object newChat() { return new DeathChatScreen(); }
        public void show(Object screen) { mc().gui.setScreen((Screen)screen); }
    };
    public ControlsMod() {
        NeoForge.EVENT_BUS.addListener(this::onKey);
        NeoForge.EVENT_BUS.addListener(this::onTick);
    }
    private void onKey(ScreenEvent.KeyPressed.Pre event) {
        if(event.getScreen()==host.screen() && session.open(event.getKeyCode(),host))event.setCanceled(true);
    }
    private void onTick(ClientTickEvent.Post event) { session.tick(host); }
}
