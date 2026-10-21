/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.client.Minecraft
 *  net.minecraft.client.gui.GuiGraphicsExtractor
 *  net.minecraft.client.gui.components.EditBox
 *  net.minecraft.client.gui.components.events.GuiEventListener
 *  net.minecraft.client.gui.screens.Screen
 *  net.minecraft.client.resources.sounds.SimpleSoundInstance
 *  net.minecraft.client.resources.sounds.SoundInstance
 *  net.minecraft.core.Holder
 *  net.minecraft.network.chat.Component
 *  net.minecraft.sounds.SoundEvents
 */
package fr.yapapouaiye.nexlux.client;

import fr.yapapouaiye.nexlux.client.GuiEditorScreen;
import fr.yapapouaiye.nexlux.client.LunarClientConfig;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;

public class LunarClientScreen
extends Screen {
    private int scrollOffset = 0;
    private EditBox searchBox;
    private static final int COLS = 4;
    private static final int CARD_H = 68;
    private static final int CARD_GAP = 6;
    private final List<ClientModItem> allMods = new ArrayList<ClientModItem>();

    public LunarClientScreen() {
        super((Component)Component.literal((String)"Yapapouaiye Client In-Game Menu"));
        this.initModList();
    }

    protected void init() {
        String previousSearch = this.searchBox != null ? this.searchBox.getValue() : "";
        super.init();
        try {
            Minecraft.getInstance().gameRenderer.clearPostEffect();
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        int panelWidth = Math.min(460, this.width - 24);
        int panelX = (this.width - panelWidth) / 2;
        int panelY = (this.height - Math.min(270, this.height - 24)) / 2;
        int tabY = panelY + 28;
        int searchW = 105;
        int searchX = panelX + panelWidth - searchW - 8;
        this.searchBox = new EditBox(this.font, searchX + 18, tabY + 4, searchW - 22, 11, (Component)Component.literal((String)"Chercher..."));
        this.searchBox.setHint((Component)Component.literal((String)"Chercher..."));
        this.searchBox.setMaxLength(32);
        this.searchBox.setBordered(false);
        this.searchBox.setValue(previousSearch);
        this.searchBox.setResponder(value -> {
            this.scrollOffset = 0;
        });
        this.addRenderableWidget(this.searchBox);
    }

    private void initModList() {
        this.allMods.clear();
        this.allMods.add(new ClientModItem("nightvision", "Night Vision", "\ud83c\udf19", "visual", true));
        this.allMods.add(new ClientModItem("nofog", "Anti-Brouillard", "\ud83c\udf2b\ufe0f", "visual", true));
        this.allMods.add(new ClientModItem("zoom", "Zoom [C]", "\ud83d\udd0d", "visual", true));
        this.allMods.add(new ClientModItem("fpsboost", "FPS Boost", "\u26a1", "perf", true));
        this.allMods.add(new ClientModItem("coords", "Coordonn\u00e9es", "\u2726", "visual", false));
        this.allMods.add(new ClientModItem("cps", "Compteur CPS", "\u2328", "hud", false));
        this.allMods.add(new ClientModItem("armor", "Armor Status", "\ud83d\udee1", "hud", false));
        this.allMods.add(new ClientModItem("speed", "Vitesse", "\ud83d\udca8", "hud", false));
        this.allMods.add(new ClientModItem("fps", "FPS", "\ud83c\udfa5", "hud", false));
        this.allMods.add(new ClientModItem("ping", "Ping", "\ud83d\udcf6", "hud", false));
    }

    private boolean isModActive(String id) {
        return switch (id) {
            case "nightvision" -> LunarClientConfig.isNightVision();
            case "nofog" -> LunarClientConfig.isNoFog();
            case "fpsboost" -> LunarClientConfig.isFpsBoost();
            case "zoom" -> LunarClientConfig.isZoom();
            case "coords" -> LunarClientConfig.isCoordinates();
            case "cps" -> LunarClientConfig.isCpsCounter();
            case "armor" -> LunarClientConfig.isArmorStatus();
            case "speed" -> LunarClientConfig.isSpeed();
            case "fps" -> LunarClientConfig.isFps();
            case "ping" -> LunarClientConfig.isPing();
            default -> false;
        };
    }

    private void toggleMod(String id) {
        this.playClickSound();
        switch (id) {
            case "nightvision": {
                LunarClientConfig.setNightVision(!LunarClientConfig.isNightVision(), true);
                break;
            }
            case "nofog": {
                LunarClientConfig.setNoFog(!LunarClientConfig.isNoFog(), true);
                break;
            }
            case "fpsboost": {
                LunarClientConfig.setFpsBoost(!LunarClientConfig.isFpsBoost(), true);
                break;
            }
            case "zoom": {
                LunarClientConfig.setZoom(!LunarClientConfig.isZoom(), true);
                break;
            }
            case "coords": {
                LunarClientConfig.setCoordinates(!LunarClientConfig.isCoordinates(), true);
                break;
            }
            case "cps": {
                LunarClientConfig.setCpsCounter(!LunarClientConfig.isCpsCounter(), true);
                break;
            }
            case "armor": {
                LunarClientConfig.setArmorStatus(!LunarClientConfig.isArmorStatus(), true);
                break;
            }
            case "speed": {
                LunarClientConfig.setSpeed(!LunarClientConfig.isSpeed(), true);
                break;
            }
            case "fps": {
                LunarClientConfig.setFps(!LunarClientConfig.isFps(), true);
                break;
            }
            case "ping": {
                LunarClientConfig.setPing(!LunarClientConfig.isPing(), true);
            }
        }
    }

    private void playClickSound() {
        try {
            Minecraft.getInstance().getSoundManager().play((SoundInstance)SimpleSoundInstance.forUI((Holder)SoundEvents.UI_BUTTON_CLICK, (float)1.0f));
        }
        catch (Exception exception) {
            // empty catch block
        }
    }

    public void renderBlurredBackground(float partialTick) {
    }

    public void extractBackground(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY, float partialTick) {
    }

    public void extractRenderState(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY, float partialTick) {
        boolean closeHover;
        int panelWidth = Math.min(460, this.width - 24);
        int panelHeight = Math.min(270, this.height - 24);
        int panelX = (this.width - panelWidth) / 2;
        int panelY = (this.height - panelHeight) / 2;
        guiGraphics.fill(0, 0, this.width, this.height, -2063597568);
        guiGraphics.fill(panelX, panelY, panelX + panelWidth, panelY + panelHeight, -233498591);
        guiGraphics.outline(panelX, panelY, panelWidth, panelHeight, -14144195);
        guiGraphics.fill(panelX, panelY, panelX + panelWidth, panelY + 24, -15592420);
        guiGraphics.fill(panelX, panelY + 24, panelX + panelWidth, panelY + 25, -14144195);
        guiGraphics.text(this.font, "\u00a76\u2726 \u00a7f\u00a7lYAPAPOUAIYE CLIENT", panelX + 8, panelY + 8, 0xFFFFFF, false);
        int closeX = panelX + panelWidth - 20;
        int closeY = panelY + 4;
        boolean bl = closeHover = mouseX >= closeX && mouseX <= closeX + 16 && mouseY >= closeY && mouseY <= closeY + 16;
        if (closeHover) {
            guiGraphics.fill(closeX, closeY, closeX + 16, closeY + 16, 1357200958);
        }
        guiGraphics.centeredText(this.font, "\u2715", closeX + 8, closeY + 4, closeHover ? -38037 : -6248779);
        int tabY = panelY + 28;
        int tabX = panelX + 8;
        int tabW = 55;
        int tabH = 18;
        guiGraphics.fill(tabX, tabY, tabX + tabW, tabY + tabH, -16733953);
        guiGraphics.centeredText(this.font, "Mods", tabX + tabW / 2, tabY + 5, -1);
        int editorBtnX = tabX + tabW + 6;
        int editorBtnW = 95;
        boolean editorHover = mouseX >= editorBtnX && mouseX <= editorBtnX + editorBtnW && mouseY >= tabY && mouseY <= tabY + tabH;
        guiGraphics.fill(editorBtnX, tabY, editorBtnX + editorBtnW, tabY + tabH, editorHover ? 1073785087 : 0x20FFFFFF);
        guiGraphics.outline(editorBtnX, tabY, editorBtnW, tabH, editorHover ? -16733953 : -14144195);
        guiGraphics.centeredText(this.font, "\u2725 \u00c9diter HUD", editorBtnX + editorBtnW / 2, tabY + 5, editorHover ? -1 : -6248779);
        int searchW = 105;
        int searchX = panelX + panelWidth - searchW - 8;
        boolean searchHover = mouseX >= searchX && mouseX <= searchX + searchW && mouseY >= tabY && mouseY <= tabY + 18;
        guiGraphics.fill(searchX, tabY, searchX + searchW, tabY + 18, 0x30000000);
        guiGraphics.outline(searchX, tabY, searchW, 18, this.searchBox != null && this.searchBox.isFocused() || searchHover ? -16733953 : -14144195);
        guiGraphics.text(this.font, "\u00a77\ud83d\udd0d", searchX + 5, tabY + 5, 0x888888, false);
        guiGraphics.fill(panelX, panelY + 50, panelX + panelWidth, panelY + 51, -14144195);
        int gridX = panelX + 8;
        int gridY = panelY + 56;
        int gridW = panelWidth - 16;
        int gridH = panelHeight - 62;
        List<ClientModItem> filtered = this.getFilteredMods();
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.getMaxScroll(gridH, filtered.size())));
        int cardW = (gridW - 18) / 4;
        for (int i = 0; i < filtered.size(); ++i) {
            ClientModItem item = filtered.get(i);
            int col = i % 4;
            int row = i / 4;
            int cX = gridX + col * (cardW + 6);
            int cY = gridY + row * 74 - this.scrollOffset;
            if (cY + 68 < gridY || cY > gridY + gridH) continue;
            boolean active = this.isModActive(item.id);
            boolean cardHover = mouseX >= cX && mouseX <= cX + cardW && mouseY >= cY && mouseY <= cY + 68 && mouseY >= gridY && mouseY <= gridY + gridH;
            int cardBg = cardHover ? -2145245644 : 1612192292;
            guiGraphics.fill(cX, cY, cX + cardW, cY + 68, cardBg);
            int outlineColor = cardHover ? -16733953 : (active ? -2147440385 : -14144195);
            guiGraphics.outline(cX, cY, cardW, 68, outlineColor);
            guiGraphics.centeredText(this.font, item.title, cX + cardW / 2, cY + 6, active ? -1 : -4867385);
            guiGraphics.centeredText(this.font, item.icon, cX + cardW / 2, cY + 22, 0xFFFFFF);
            int swW = 24;
            int swH = 11;
            int swX = cX + (cardW - swW) / 2;
            int swY = cY + 68 - 18;
            int swBg = active ? -16733953 : -13815233;
            guiGraphics.fill(swX, swY, swX + swW, swY + swH, swBg);
            if (active) {
                guiGraphics.fill(swX + 13, swY + 1, swX + 23, swY + swH - 1, -1);
                continue;
            }
            guiGraphics.fill(swX + 1, swY + 1, swX + 11, swY + swH - 1, -7696224);
        }
        super.extractRenderState(guiGraphics, mouseX, mouseY, partialTick);
    }

    private List<ClientModItem> getFilteredMods() {
        String query = this.searchBox != null ? this.searchBox.getValue().trim().toLowerCase() : "";
        ArrayList<ClientModItem> list = new ArrayList<ClientModItem>();
        for (ClientModItem item : this.allMods) {
            if (!query.isEmpty() && !item.title.toLowerCase().contains(query) && !item.id.toLowerCase().contains(query)) continue;
            list.add(item);
        }
        return list;
    }

    private int getMaxScroll(int gridH, int itemCount) {
        int rows = (itemCount + 4 - 1) / 4;
        if (rows <= 0) {
            return 0;
        }
        int totalH = rows * 68 + (rows - 1) * 6;
        return Math.max(0, totalH - gridH);
    }

    @Override
    public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
        int panelWidth = Math.min(460, this.width - 24);
        int panelHeight = Math.min(270, this.height - 24);
        int panelX = (this.width - panelWidth) / 2;
        int panelY = (this.height - panelHeight) / 2;
        int closeX = panelX + panelWidth - 20;
        int closeY = panelY + 4;
        if (mouseX >= (double)closeX && mouseX <= (double)(closeX + 16) && mouseY >= (double)closeY && mouseY <= (double)(closeY + 16)) {
            this.playClickSound();
            this.onClose();
            return true;
        }
        int tabY = panelY + 28;
        int tabX = panelX + 8;
        int tabW = 55;
        int tabH = 18;
        int editorBtnX = tabX + tabW + 6;
        int editorBtnW = 95;
        if (mouseX >= (double)editorBtnX && mouseX <= (double)(editorBtnX + editorBtnW) && mouseY >= (double)tabY && mouseY <= (double)(tabY + tabH)) {
            this.playClickSound();
            if (this.minecraft != null) {
                this.minecraft.gui.setScreen((Screen)new GuiEditorScreen(this));
            }
            return true;
        }
        int gridX = panelX + 8;
        int gridY = panelY + 56;
        int gridW = panelWidth - 16;
        int gridH = panelHeight - 62;
        if (mouseX >= (double)gridX && mouseX <= (double)(gridX + gridW) && mouseY >= (double)gridY && mouseY <= (double)(gridY + gridH)) {
            List<ClientModItem> filtered = this.getFilteredMods();
            int cardW = (gridW - 18) / 4;
            for (int i = 0; i < filtered.size(); ++i) {
                int col = i % 4;
                int row = i / 4;
                int cX = gridX + col * (cardW + 6);
                int cY = gridY + row * 74 - this.scrollOffset;
                if (cY + 68 < gridY || cY > gridY + gridH || !(mouseX >= (double)cX) || !(mouseX <= (double)(cX + cardW)) || !(mouseY >= (double)cY) || !(mouseY <= (double)(cY + 68))) continue;
                this.toggleMod(filtered.get((int)i).id);
                return true;
            }
        }
        return super.mouseClicked(event, doubleClick);
    }

    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (scrollY != 0.0) {
            int panelWidth = Math.min(460, this.width - 24);
            int panelHeight = Math.min(270, this.height - 24);
            int panelX = (this.width - panelWidth) / 2;
            int panelY = (this.height - panelHeight) / 2;
            int gridX = panelX + 8;
            int gridY = panelY + 56;
            int gridW = panelWidth - 16;
            int gridH = panelHeight - 62;
            if (mouseX >= (double)gridX && mouseX <= (double)(gridX + gridW) && mouseY >= (double)gridY && mouseY <= (double)(gridY + gridH)) {
                int maxScroll = this.getMaxScroll(gridH, this.getFilteredMods().size());
                this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset - (int)(scrollY * 16.0)));
                return true;
            }
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
    }

    @Override
    public boolean keyPressed(net.minecraft.client.input.KeyEvent event) {
        int keyCode = event.key();
        if (this.searchBox != null && this.searchBox.isFocused()) {
            if (keyCode == 256) {
                this.searchBox.setFocused(false);
                return true;
            }
            if (this.searchBox.keyPressed(event)) {
                return true;
            }
        }
        if (keyCode == 344 || keyCode == 256) {
            this.onClose();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public boolean charTyped(net.minecraft.client.input.CharacterEvent event) {
        if (this.searchBox != null && this.searchBox.isFocused() && this.searchBox.charTyped(event)) {
            return true;
        }
        return super.charTyped(event);
    }

    public boolean isPauseScreen() {
        return false;
    }

    private static class ClientModItem {
        final String id;
        final String title;
        final String icon;
        final String category;
        final boolean isPopular;

        ClientModItem(String id, String title, String icon, String category, boolean isPopular) {
            this.id = id;
            this.title = title;
            this.icon = icon;
            this.category = category;
            this.isPopular = isPopular;
        }
    }
}

