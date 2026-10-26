package fr.yapapouaiye.nexlux.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;

public class LunarClientScreen extends Screen {
    private int scrollOffset;
    private EditBox searchBox;
    private int windowGesture;
    private double gestureMouseX, gestureMouseY;
    private ClientMenuLayout gestureStart;
    private final List<ClientModItem> allMods = new ArrayList<>();

    public LunarClientScreen() {
        super(Component.literal("NexLux"));
        initModList();
    }

    private ClientMenuLayout layout() { return LunarClientConfig.getClientMenu().layout(width, height); }

    private void updateWindowWidgets() {
        ClientMenuLayout l = layout();
        if (searchBox != null) {
            searchBox.setX(l.searchX + 19);
            searchBox.setY(l.searchY + 6);
            searchBox.setWidth(Math.max(1, l.searchWidth - 25));
        }
        scrollOffset = Math.max(0, Math.min(scrollOffset, l.maxScroll(getFilteredMods().size())));
    }

    private void finishWindowGesture() {
        if (windowGesture != 0) {
            windowGesture = 0;
            gestureStart = null;
            LunarClientConfig.save();
        }
    }

    @Override protected void init() {
        finishWindowGesture();
        String query = searchBox == null ? "" : searchBox.getValue();
        super.init();
        ClientMenuLayout l = layout();
        searchBox = new EditBox(font, l.searchX + 19, l.searchY + 6,
            Math.max(1, l.searchWidth - 25), 12, Component.literal("Rechercher un module"));
        searchBox.setHint(Component.literal("Rechercher…"));
        searchBox.setMaxLength(48);
        searchBox.setBordered(false);
        searchBox.setValue(query);
        searchBox.setResponder(value -> scrollOffset = 0);
        addRenderableWidget(searchBox);
        scrollOffset = Math.min(scrollOffset, l.maxScroll(getFilteredMods().size()));
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
        this.allMods.add(new ClientModItem("potions", "Potion Timer", "", "hud", false));
        this.allMods.add(new ClientModItem("saturation", "Saturation", "", "hud", false));
    }

    private boolean isModActive(String id) {
        if (ExtraHud.supports(id)) return ExtraHud.settings(id).enabled;
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
        if (ExtraHud.supports(id)) {
            var settings = ExtraHud.settings(id);
            settings.enabled = !settings.enabled;
            ExtraHud.invalidate();
            ExtraHud.fit(id);
            LunarClientConfig.save();
            return;
        }
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


    @Override public void extractBackground(GuiGraphicsExtractor gui, int mx, int my, float tick) {}

    @Override public void extractRenderState(GuiGraphicsExtractor gui, int mx, int my, float tick) {
        ClientMenuLayout l = layout();
        gui.fill(0, 0, width, height, 0x77000000);
        gui.fill(l.x, l.y, l.x + l.width, l.y + l.height, 0xF5111721);
        gui.outline(l.x, l.y, l.width, l.height, 0xFF303D50);
        gui.fill(l.x, l.y, l.x + l.width, l.y + 26, 0xFF141E2C);
        ClientIcons.draw(gui, "star", l.x + 10, l.y + 9, 1, 0xFF00BBF9);
        gui.text(font, "NexLux", l.x + 24, l.y + 9, -1, false);
        if (l.width >= 420) gui.centeredText(font, "Glisser le titre pour déplacer", l.x + l.width / 2, l.y + 9, 0xFF8FA6BD);
        boolean closeHover = ClientMenuLayout.contains(mx, my, l.x + l.width - 24, l.y + 5, 18, 18);
        if (closeHover) gui.fill(l.x + l.width - 24, l.y + 5, l.x + l.width - 6, l.y + 23, 0xFF57303C);
        ClientIcons.draw(gui, "close", l.x + l.width - 19, l.y + 10, 1, closeHover ? 0xFFFFA6B2 : 0xFFB4C1D4);
        gui.fill(l.x + 10, l.toolbarY, l.x + 66, l.toolbarY + 22, 0xFF00A5DF);
        gui.centeredText(font, "Modules", l.x + 38, l.toolbarY + 7, -1);
        boolean editorHover = ClientMenuLayout.contains(mx, my, l.x + 72, l.toolbarY, 106, 22);
        gui.fill(l.x + 72, l.toolbarY, l.x + 178, l.toolbarY + 22, editorHover ? 0xFF293E54 : 0xFF1B2737);
        ClientIcons.draw(gui, "move", l.x + 80, l.toolbarY + 7, 1, 0xFFB3DDF3);
        gui.text(font, "Éditer le HUD", l.x + 94, l.toolbarY + 7, -1, false);
        gui.fill(l.searchX, l.searchY, l.searchX + l.searchWidth, l.searchY + 22, 0xFF0B111B);
        gui.outline(l.searchX, l.searchY, l.searchWidth, 22,
            searchBox != null && searchBox.isFocused() ? 0xFF00BBF9 : 0xFF303D50);
        ClientIcons.draw(gui, "search", l.searchX + 6, l.searchY + 7, 1, 0xFF91A7C0);

        List<ClientModItem> items = getFilteredMods();
        scrollOffset = Math.max(0, Math.min(scrollOffset, l.maxScroll(items.size())));
        gui.enableScissor(l.gridX, l.gridY, l.gridX + l.gridWidth, l.gridY + l.gridHeight);
        for (int i = 0; i < items.size(); i++) {
            int x = l.cardX(i), y = l.cardY(i, scrollOffset);
            if (y + ClientMenuLayout.CARD_HEIGHT <= l.gridY || y >= l.gridY + l.gridHeight) continue;
            ClientModItem item = items.get(i);
            boolean active = isModActive(item.id);
            boolean hover = l.hitCard(mx, my, items.size(), scrollOffset) == i;
            gui.fill(x, y, x + l.cardWidth, y + ClientMenuLayout.CARD_HEIGHT, hover ? 0xFF24364B : 0xFF192333);
            gui.outline(x, y, l.cardWidth, ClientMenuLayout.CARD_HEIGHT, hover ? 0xFF00BBF9 : active ? 0xFF267798 : 0xFF303D50);
            String label = font.plainSubstrByWidth(item.title, Math.max(1, l.cardWidth - 12));
            gui.centeredText(font, label, x + l.cardWidth / 2, y + 9, active ? -1 : 0xFFA8B6CA);
            ClientIcons.draw(gui, item.id, x + l.cardWidth / 2 - 8, y + 28, 2, active ? 0xFF5DD8FF : 0xFF7A91A9);
            int toggleX = x + l.cardWidth / 2 - 13;
            gui.fill(toggleX, y + 59, toggleX + 26, y + 71, active ? 0xFF00A9E0 : 0xFF3C485B);
            int knobX = toggleX + (active ? 15 : 2);
            gui.fill(knobX, y + 61, knobX + 9, y + 69, active ? -1 : 0xFF97A7BA);
        }
        if (items.isEmpty()) gui.centeredText(font, "Aucun module trouvé", l.x + l.width / 2, l.gridY + 20, 0xFFB4C1D4);
        gui.disableScissor();
        int maxScroll = l.maxScroll(items.size());
        if (maxScroll > 0) {
            int thumbHeight = Math.max(12, l.gridHeight * l.gridHeight / (l.gridHeight + maxScroll));
            int thumbY = l.gridY + scrollOffset * (l.gridHeight - thumbHeight) / maxScroll;
            gui.fill(l.x + l.width - 5, l.gridY, l.x + l.width - 3, l.gridY + l.gridHeight, 0xFF263345);
            gui.fill(l.x + l.width - 5, thumbY, l.x + l.width - 3, thumbY + thumbHeight, 0xFF00A9E0);
        }
        gui.text(font, font.plainSubstrByWidth("Coin : taille | Clic droit : réglages HUD", l.width - 28), l.x + 10, l.y + l.height - 12, 0xFF8FA6BD, false);
        int gripColor = windowGesture == 2 || l.onResizeHandle(mx, my) ? 0xFF5DD8FF : 0xFF7891A9;
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j <= i; j++) {
                int gx = l.x + l.width - 5 - j * 3;
                int gy = l.y + l.height - 5 - (i - j) * 3;
                gui.fill(gx, gy, gx + 2, gy + 2, gripColor);
            }
        }
        super.extractRenderState(gui, mx, my, tick);
    }

    private List<ClientModItem> getFilteredMods() {
        String query = searchBox == null ? "" : searchBox.getValue().trim().toLowerCase(Locale.ROOT);
        List<ClientModItem> result = new ArrayList<>();
        for (ClientModItem item : allMods) {
            if (query.isEmpty() || item.title.toLowerCase(Locale.ROOT).contains(query) || item.id.contains(query)) result.add(item);
        }
        return result;
    }

    @Override public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        ClientMenuLayout l = layout();
        if (event.button() == 1) {
            List<ClientModItem> items = getFilteredMods();
            int index = l.hitCard(event.x(), event.y(), items.size(), scrollOffset);
            if (index >= 0 && ExtraHud.supports(items.get(index).id)) {
                minecraft.gui.setScreen(new ExtraHudScreen(this, items.get(index).id));
                return true;
            }
        }
        if (event.button() == 0) {
            if (ClientMenuLayout.contains(event.x(), event.y(), l.x + l.width - 24, l.y + 5, 18, 18)) {
                playClickSound(); onClose(); return true;
            }
            if (l.onHeader(event.x(), event.y()) || l.onResizeHandle(event.x(), event.y())) {
                if (doubleClick && l.onHeader(event.x(), event.y())) {
                    LunarClientConfig.getClientMenu().reset();
                    updateWindowWidgets();
                    LunarClientConfig.save();
                    return true;
                }
                windowGesture = l.onResizeHandle(event.x(), event.y()) ? 2 : 1;
                gestureMouseX = event.x();
                gestureMouseY = event.y();
                gestureStart = l;
                if (searchBox != null) searchBox.setFocused(false);
                return true;
            }
            if (ClientMenuLayout.contains(event.x(), event.y(), l.x + 72, l.toolbarY, 106, 22)) {
                playClickSound(); minecraft.gui.setScreen(new GuiEditorScreen(this)); return true;
            }
            List<ClientModItem> items = getFilteredMods();
            int index = l.hitCard(event.x(), event.y(), items.size(), scrollOffset);
            if (index >= 0) { toggleMod(items.get(index).id); return true; }
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override public boolean mouseDragged(net.minecraft.client.input.MouseButtonEvent event, double dx, double dy) {
        if (windowGesture != 0 && event.button() == 0) {
            int deltaX = (int)Math.round(event.x() - gestureMouseX);
            int deltaY = (int)Math.round(event.y() - gestureMouseY);
            ClientMenuWindow window = LunarClientConfig.getClientMenu();
            if (windowGesture == 1) {
                window.moveTo(width, height, gestureStart.x + deltaX, gestureStart.y + deltaY);
            } else {
                window.resizeTo(width, height, gestureStart.x, gestureStart.y,
                    gestureStart.width + deltaX, gestureStart.height + deltaY);
            }
            updateWindowWidgets();
            return true;
        }
        return super.mouseDragged(event, dx, dy);
    }

    @Override public boolean mouseReleased(net.minecraft.client.input.MouseButtonEvent event) {
        if (windowGesture != 0 && event.button() == 0) {
            finishWindowGesture();
            return true;
        }
        return super.mouseReleased(event);
    }

    @Override public void removed() {
        finishWindowGesture();
        super.removed();
    }

    @Override public boolean mouseScrolled(double mx, double my, double dx, double dy) {
        ClientMenuLayout l = layout();
        if (l.inGrid(mx, my) && dy != 0) {
            scrollOffset = Math.max(0, Math.min(l.maxScroll(getFilteredMods().size()), scrollOffset - (int)(dy * 24)));
            return true;
        }
        return super.mouseScrolled(mx, my, dx, dy);
    }

    @Override public boolean keyPressed(net.minecraft.client.input.KeyEvent event) {
        if (searchBox != null && searchBox.isFocused()) {
            if (event.key() == 256) { searchBox.setFocused(false); return true; }
            return super.keyPressed(event);
        }
        if (event.key() == 344 || event.key() == 256) { onClose(); return true; }
        return super.keyPressed(event);
    }

    @Override public boolean isPauseScreen() { return false; }

    private static class ClientModItem {
        final String id, title;
        ClientModItem(String id, String title, String unusedIcon, String category, boolean popular) {
            this.id = id; this.title = title;
        }
    }
}
