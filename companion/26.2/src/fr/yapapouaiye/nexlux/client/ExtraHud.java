package fr.yapapouaiye.nexlux.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;

public final class ExtraHud {
    private record Row(MobEffectInstance effect, String label) {}
    private record Layout(Object player, Object font, int tick, int windowWidth, int windowHeight, int options,
                          List<Row> rows, int contentWidth, int contentHeight, float scale, boolean empty) {
        int width() { return (int)Math.ceil(contentWidth * scale); }
        int height() { return (int)Math.ceil(contentHeight * scale); }
    }
    private static Layout potionLayout, saturationLayout;
    private static final int[] lastWidth = new int[2], lastHeight = new int[2], lastScreenWidth = new int[2], lastScreenHeight = new int[2];
    private ExtraHud() {}
    public static boolean supports(String id) { return "potions".equals(id) || "saturation".equals(id); }
    public static ExtraHudSettings settings(String id) {
        return "potions".equals(id) ? LunarClientConfig.getPotionTimer() : LunarClientConfig.getSaturation();
    }
    public static void resetPositions() {
        settings("potions").x = settings("saturation").x = 180;
        settings("potions").y = 40;
        settings("saturation").y = 140;
        invalidate();
    }
    public static String roman(int level) {
        int[] values = {100, 90, 50, 40, 10, 9, 5, 4, 1};
        String[] symbols = {"C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < values.length; i++) while (level >= values[i]) {
            result.append(symbols[i]); level -= values[i];
        }
        return result.toString();
    }
    public static String time(int ticks) {
        if (ticks < 0) return "∞";
        long seconds = (ticks + 19L) / 20;
        return String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }
    private static List<MobEffectInstance> effects(boolean preview) {
        var player = Minecraft.getInstance().player;
        List<MobEffectInstance> effects = new ArrayList<>();
        if (player != null) for (var effect : player.getActiveEffects()) {
            if (effect.isInfiniteDuration() || effect.getDuration() > 0) effects.add(effect);
        }
        effects.sort(java.util.Comparator.comparing(effect -> effect.getDescriptionId()));
        // Editor only; no example effects ever enter the in-game renderer.
        if (preview && effects.isEmpty()) effects.add(new MobEffectInstance(MobEffects.SPEED, 1800, 1));
        return effects;
    }
    private static String label(MobEffectInstance effect, ExtraHudSettings s) {
        StringBuilder text = new StringBuilder();
        if (s.names) text.append(effect.getEffect().value().getDisplayName().getString());
        if (s.levels) { if (!text.isEmpty()) text.append(' '); text.append(roman(effect.getAmplifier() + 1)); }
        if (s.duration) { if (!text.isEmpty()) text.append("  "); text.append(time(effect.getDuration())); }
        return text.toString();
    }
    private static Layout layout(String id) {
        var mc = Minecraft.getInstance();
        var s = settings(id);
        s.sanitize();
        int tick = mc.player == null ? 0 : mc.player.tickCount;
        int windowWidth = mc.getWindow().getGuiScaledWidth(), windowHeight = mc.getWindow().getGuiScaledHeight();
        int options = Float.floatToIntBits(s.scale) * 31 + (s.icons ? 1 : 0) + (s.names ? 2 : 0)
            + (s.levels ? 4 : 0) + (s.duration ? 8 : 0) + (s.number ? 16 : 0) + (s.bar ? 32 : 0);
        boolean potions = "potions".equals(id);
        Layout cached = potions ? potionLayout : saturationLayout;
        if (cached != null && cached.player == mc.player && cached.font == mc.font && cached.tick == tick
                && cached.windowWidth == windowWidth && cached.windowHeight == windowHeight && cached.options == options) return cached;
        List<Row> rows = new ArrayList<>();
        int width = 0;
        boolean empty = !potions || effects(false).isEmpty();
        if (potions) for (var effect : effects(true)) {
            String label = label(effect, s);
            rows.add(new Row(effect, label));
            width = Math.max(width, mc.font.width(label));
        }
        int contentWidth = potions ? Math.max(24, width + (s.icons ? 22 : 0) + 8)
            : s.number ? Math.max(124, mc.font.width("Saturation ≈ 20.0/20") + 8) : 124;
        int contentHeight = potions ? Math.max(1, rows.size()) * (s.icons ? 22 : 13) + 8 : s.number && s.bar ? 29 : s.bar ? 16 : 17;
        Layout result = new Layout(mc.player, mc.font, tick, windowWidth, windowHeight, options, rows,
            contentWidth, contentHeight, s.fittedScale(contentWidth, contentHeight, windowWidth, windowHeight), empty);
        if (potions) potionLayout = result; else saturationLayout = result;
        return result;
    }
    public static void invalidate() {
        potionLayout = saturationLayout = null;
        java.util.Arrays.fill(lastWidth, 0);
    }
    public static int width(String id) { return layout(id).width(); }
    public static int height(String id) { return layout(id).height(); }
    public static void fit(String id) {
        var window = Minecraft.getInstance().getWindow();
        int width = width(id), height = height(id), sw = window.getGuiScaledWidth(), sh = window.getGuiScaledHeight();
        var s = settings(id);
        s.fit(width, height, sw, sh);
        int index = "potions".equals(id) ? 0 : 1;
        if (lastWidth[index] == width && lastHeight[index] == height && lastScreenWidth[index] == sw && lastScreenHeight[index] == sh) return;
        lastWidth[index] = width; lastHeight[index] = height; lastScreenWidth[index] = sw; lastScreenHeight[index] = sh;
        List<int[]> obstacles = new ArrayList<>();
        for (String other : HudMetrics.IDS) {
            if (id.equals(other) || !enabled(other)) continue;
            int pad = HudMetrics.padding(other);
            int x = supports(other) ? settings(other).x : HudMetrics.x(other) - pad;
            int y = supports(other) ? settings(other).y : HudMetrics.y(other) - pad;
            obstacles.add(new int[]{x, y, HudMetrics.width(other), HudMetrics.height(other)});
        }
        int[] position = HudLayout.avoidOverlap(s.x, s.y, width, height, sw, sh, obstacles.toArray(int[][]::new));
        s.x = position[0]; s.y = position[1];
    }
    private static boolean enabled(String id) {
        return switch (id) {
            case "coords" -> LunarClientConfig.isCoordinates();
            case "cps" -> LunarClientConfig.isCpsCounter();
            case "armor" -> LunarClientConfig.isArmorStatus();
            case "speed" -> LunarClientConfig.isSpeed();
            case "fps" -> LunarClientConfig.isFps();
            case "ping" -> LunarClientConfig.isPing();
            default -> settings(id).enabled;
        };
    }
    public static void render(GuiGraphicsExtractor gui, String id, boolean preview) {
        // Saturation is attached to vanilla food/hearts by SaturationHudMixin.
        if ("saturation".equals(id)) return;
        var mc = Minecraft.getInstance();
        var s = settings(id);
        if (!preview && !s.enabled) return;
        Layout layout = layout(id);
        if ("potions".equals(id) && layout.empty && !preview) return;
        fit(id);
        // Use the preview rectangle in both paths, so drag bounds always match drawing.
        float scale = layout.scale;
        gui.pose().pushMatrix();
        try {
            gui.pose().translate(s.x, s.y);
            gui.pose().scale(scale, scale);
            if (s.background) gui.fill(0, 0, layout.contentWidth, layout.contentHeight, s.backgroundColor);
            if ("potions".equals(id)) {
                int y = 4;
                for (var row : layout.rows) {
                    var effect = row.effect;
                    if (s.icons) gui.blitSprite(RenderPipelines.GUI_TEXTURED, Hud.getMobEffectSprite(effect.getEffect()), 4, y, 18, 18);
                    gui.text(mc.font, row.label, s.icons ? 26 : 4, y + (s.icons ? 5 : 0), s.textColor, true);
                    y += s.icons ? 22 : 13;
                }
            }
        } finally { gui.pose().popMatrix(); }
    }
}
