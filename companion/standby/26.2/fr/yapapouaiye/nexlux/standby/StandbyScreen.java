package fr.yapapouaiye.nexlux.standby;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class StandbyScreen extends Screen {
    public StandbyScreen() { super(Component.literal("Compte en veille")); }

    @Override protected void init() {
        StandbyClient.enter();
        addRenderableWidget(Button.builder(Component.literal("Reprendre le jeu"), button -> onClose())
            .bounds((width - 160) / 2, height / 2 + 26, 160, 20).build());
    }

    @Override public void extractRenderState(GuiGraphicsExtractor gui, int x, int y, float partialTick) {
        gui.fill(0, 0, width, height, 0xFF0B0D13);
        gui.centeredText(font, title, width / 2, height / 2 - 38, 0x38CC56);
        gui.centeredText(font, "Vous restez connecté au serveur.", width / 2, height / 2 - 16, 0xF1F5F9);
        gui.centeredText(font, StandbyNetworkClient.status(), width / 2, height / 2, 0x94A3B8);
        super.extractRenderState(gui, x, y, partialTick);
    }

    @Override public void extractBackground(GuiGraphicsExtractor gui, int x, int y, float partialTick) {}
    @Override public boolean isPauseScreen() { return false; }
    @Override public void onClose() { StandbyClient.resume(); if (!StandbyNetworkClient.frozen()) StandbyPlatform.setScreen(null); }
    @Override public void removed() { StandbyClient.resume(); }
}
