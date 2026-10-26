package fr.yapapouaiye.nexlux.client;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.IntConsumer;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Small scrollable settings page using Minecraft controls and NexLux's palette. */
public final class ExtraHudScreen extends Screen {
    private record Row(String label, AbstractWidget widget) {}
    private final Screen parent;
    private final String id;
    private final List<Row> rows = new ArrayList<>();
    private int scroll;
    private int left, panelWidth;
    public ExtraHudScreen(Screen parent, String id) {
        super(Component.literal("potions".equals(id) ? "Potion Timer" : "Saturation"));
        this.parent = parent;
        this.id = id;
    }
    private ExtraHudSettings settings() { return ExtraHud.settings(id); }
    private void toggle(String label, BooleanSupplier get, Consumer<Boolean> set) {
        Button button = Button.builder(Component.literal(label + " : " + (get.getAsBoolean() ? "ON" : "OFF")), b -> {
            set.accept(!get.getAsBoolean());
            settings().sanitize();
            ExtraHud.invalidate();
            if ("potions".equals(id)) ExtraHud.fit(id);
            LunarClientConfig.save();
            rebuildWidgets();
        }).bounds(left, 0, panelWidth, 20).build();
        rows.add(new Row("", button));
        addRenderableWidget(button);
    }
    private void input(String label, String initial, Consumer<String> change) {
        EditBox box = new EditBox(font, left + panelWidth / 2, 0, panelWidth / 2, 20, Component.literal(label));
        box.setMaxLength(9);
        box.setValue(initial);
        box.setResponder(change);
        rows.add(new Row(label, box));
        addRenderableWidget(box);
    }
    public static Float parseScale(String text) {
        try {
            float percent = Float.parseFloat(text.trim().replace(',', '.'));
            return Float.isFinite(percent) && percent >= 50 && percent <= 300 ? percent / 100 : null;
        } catch (NumberFormatException ignored) { return null; }
    }
    public static Integer parseColor(String text, boolean alpha) {
        String hex = text.trim().replaceFirst("^#", "");
        if (!hex.matches(alpha ? "[0-9a-fA-F]{8}" : "[0-9a-fA-F]{6}")) return null;
        return (int)Long.parseLong(hex, 16) | (alpha ? 0 : 0xFF000000);
    }
    private void color(String label, int value, boolean alpha, IntConsumer set) {
        input(label, String.format(alpha ? "%08X" : "%06X", alpha ? value : value & 0xFFFFFF), text -> {
            Integer parsed = parseColor(text, alpha);
            if (parsed != null) { set.accept(parsed); LunarClientConfig.save(); }
        });
    }
    @Override protected void init() {
        super.init();
        rows.clear();
        panelWidth = Math.max(80, Math.min(320, width - 24));
        left = (width - panelWidth) / 2;
        ExtraHudSettings s = settings();
        s.sanitize();
        toggle("Module", () -> s.enabled, value -> s.enabled = value);
        if ("potions".equals(id)) {
            toggle("Icônes", () -> s.icons, value -> s.icons = value);
            toggle("Noms", () -> s.names, value -> s.names = value);
            toggle("Niveaux", () -> s.levels, value -> s.levels = value);
            toggle("Durées", () -> s.duration, value -> s.duration = value);
        } else {
            toggle("Contours de saturation", () -> s.bar, value -> s.bar = value);
            toggle("Aperçu nourriture en main", () -> s.icons, value -> s.icons = value);
            toggle("Aperçu cœurs (estimé)", () -> s.levels, value -> s.levels = value);
            color("Contour RRGGBB", s.barColor, false, value -> s.barColor = value);
        }
        if ("potions".equals(id)) {
            toggle("Fond", () -> s.background, value -> s.background = value);
            input("Taille % (50–300)", Integer.toString(Math.round(s.scale * 100)), text -> {
                Float value = parseScale(text);
                if (value != null) { s.scale = value; ExtraHud.fit(id); LunarClientConfig.save(); }
            });
            color("Texte RRGGBB", s.textColor, false, value -> s.textColor = value);
            color("Fond AARRGGBB", s.backgroundColor, true, value -> s.backgroundColor = value);
        }
        addRenderableWidget(Button.builder(Component.literal("Valider"), b -> onClose())
            .bounds(left, height - 27, panelWidth, 20).build());
        positionRows();
    }
    private void positionRows() {
        scroll = Math.clamp(scroll, 0, Math.max(0, rows.size() * 24 - Math.max(20, height - 74)));
        for (int i = 0; i < rows.size(); i++) {
            var widget = rows.get(i).widget;
            int y = 40 + i * 24 - scroll;
            widget.setY(y);
            widget.visible = y >= 40 && y + 20 <= height - 34;
            if (!widget.visible && widget.isFocused()) widget.setFocused(false);
        }
    }
    @Override public boolean mouseScrolled(double x, double y, double dx, double dy) {
        scroll -= (int)(dy * 24);
        positionRows();
        return true;
    }
    @Override public void extractBackground(GuiGraphicsExtractor gui, int x, int y, float tick) {}
    @Override public void extractRenderState(GuiGraphicsExtractor gui, int x, int y, float tick) {
        gui.fill(0, 0, width, height, 0xF5111721);
        gui.centeredText(font, title, width / 2, 8, -1);
        gui.centeredText(font, "Molette : défiler | Échap : retour", width / 2, 24, 0xFF8FA6BD);
        for (var row : rows) if (row.widget.visible && !row.label.isEmpty()) {
            gui.text(font, font.plainSubstrByWidth(row.label, panelWidth / 2 - 6), left, row.widget.getY() + 6, -1, false);
        }
        super.extractRenderState(gui, x, y, tick);
    }
    @Override public void onClose() {
        LunarClientConfig.save();
        minecraft.gui.setScreen(parent);
    }
    @Override public void removed() { LunarClientConfig.save(); super.removed(); }
    @Override public boolean isPauseScreen() { return false; }
}
