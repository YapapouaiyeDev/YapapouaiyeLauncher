package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

/**
 * Interface graphique (GUI Screen) en jeu de type Lunar Client.
 * S'ouvre avec la touche [Shift Droit] directement dans Minecraft.
 */
public class LunarClientScreen extends Screen {

    private Button btnNightVision;
    private Button btnNoFog;
    private Button btnFpsBoost;

    public LunarClientScreen() {
        super(Component.literal("Lunar Client In-Game Menu"));
    }

    @Override
    protected void init() {
        super.init();

        int centerX = this.width / 2;
        int centerY = this.height / 2;
        int btnWidth = 240;
        int btnHeight = 26;
        int spacing = 32;

        int startY = centerY - 55;

        // Bouton 1 : Night Vision (FullBright)
        this.btnNightVision = Button.builder(getNightVisionButtonText(), btn -> {
            boolean next = !LunarClientConfig.isNightVision();
            LunarClientConfig.setNightVision(next, true);
            btn.setMessage(getNightVisionButtonText());
        }).bounds(centerX - btnWidth / 2, startY, btnWidth, btnHeight).build();
        this.addRenderableWidget(this.btnNightVision);

        // Bouton 2 : NoFog (Anti-Brouillard)
        this.btnNoFog = Button.builder(getNoFogButtonText(), btn -> {
            boolean next = !LunarClientConfig.isNoFog();
            LunarClientConfig.setNoFog(next, true);
            btn.setMessage(getNoFogButtonText());
        }).bounds(centerX - btnWidth / 2, startY + spacing, btnWidth, btnHeight).build();
        this.addRenderableWidget(this.btnNoFog);

        // Bouton 3 : FPS Boost (Garbage Collector Flush)
        this.btnFpsBoost = Button.builder(getFpsBoostButtonText(), btn -> {
            boolean next = !LunarClientConfig.isFpsBoost();
            LunarClientConfig.setFpsBoost(next, true);
            btn.setMessage(getFpsBoostButtonText());
        }).bounds(centerX - btnWidth / 2, startY + spacing * 2, btnWidth, btnHeight).build();
        this.addRenderableWidget(this.btnFpsBoost);

        // Bouton 4 : Fermer le menu
        Button btnClose = Button.builder(Component.literal("§7Fermer [Échap]"), btn -> {
            this.onClose();
        }).bounds(centerX - btnWidth / 2, startY + spacing * 3 + 6, btnWidth, 22).build();
        this.addRenderableWidget(btnClose);
    }

    private Component getNightVisionButtonText() {
        boolean active = LunarClientConfig.isNightVision();
        return Component.literal("🌙 Night Vision : " + (active ? "§a§l[ ACTIVÉ ]" : "§c§l[ DÉSACTIVÉ ]"));
    }

    private Component getNoFogButtonText() {
        boolean active = LunarClientConfig.isNoFog();
        return Component.literal("🌫️ NoFog (Anti-Brouillard) : " + (active ? "§a§l[ ACTIVÉ ]" : "§c§l[ DÉSACTIVÉ ]"));
    }

    private Component getFpsBoostButtonText() {
        boolean active = LunarClientConfig.isFpsBoost();
        return Component.literal("⚡ FPS Boost : " + (active ? "§a§l[ ACTIVÉ ]" : "§c§l[ DÉSACTIVÉ ]"));
    }

    @Override
    public void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick) {
        int centerX = this.width / 2;
        int centerY = this.height / 2;
        int panelWidth = 280;
        int panelHeight = 220;
        int panelX = centerX - panelWidth / 2;
        int panelY = centerY - panelHeight / 2;

        // Arrière-plan semi-transparent stylisé Lunar Client
        guiGraphics.fill(0, 0, this.width, this.height, 0x70000000);
        guiGraphics.fill(panelX, panelY, panelX + panelWidth, panelY + panelHeight, 0xE50F1626);
        guiGraphics.renderOutline(panelX, panelY, panelWidth, panelHeight, 0xFF38CC56);

        // En-tête du menu Lunar Client
        guiGraphics.drawCenteredString(this.font, "§b§lLUNAR CLIENT §f• §aOptions en Jeu", centerX, panelY + 12, 0xFFFFFF);
        guiGraphics.drawCenteredString(this.font, "§7Appuyez sur §e[Shift Droit]§7 ou §e[Échap]§7 pour fermer", centerX, panelY + 26, 0x888888);

        super.render(guiGraphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        // Shift Droit ou Échap ferme le menu directement
        if (keyCode == GLFW.GLFW_KEY_RIGHT_SHIFT || keyCode == GLFW.GLFW_KEY_ESCAPE) {
            this.onClose();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean isPauseScreen() {
        // Ne met pas le jeu en pause (multijoueur fluide)
        return false;
    }
}
