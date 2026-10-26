package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;

/** Drawn inside vanilla's nine-pixel icons, using vanilla's animated coordinates. */
public final class SaturationOverlay {
    private static final Identifier FOOD = Identifier.fromNamespaceAndPath("minecraft", "hud/food_full");
    private static final Identifier FOOD_HALF = Identifier.fromNamespaceAndPath("minecraft", "hud/food_half");
    // Only the contour pixels: never paint a rectangle over the food or the world.
    private static final String[] OUTLINE = {
        "  ##     ", " #  #    ", "#    #   ", "#     #  ", " #    #  ",
        "  #   #  ", "   ### ##", "      # #", "      ## "
    };
    // The half-food sprite is diagonal, with its filled portion towards the bone.
    // A vertical crop of OUTLINE leaves an open, reversed fragment.
    private static final String[] HALF_OUTLINE = outline(new String[]{
        "         ", "   #     ", "  ###    ", "   ###   ", "   ###   ",
        "    ##   ", "      #  ", "       # ", "         "
    });

    private static String[] outline(String[] fill) {
        String[] result = new String[9];
        for (int y = 0; y < 9; y++) {
            StringBuilder row = new StringBuilder(9);
            for (int x = 0; x < 9; x++) {
                boolean edge = fill[y].charAt(x) != '#' && (
                    x > 0 && fill[y].charAt(x - 1) == '#' || x < 8 && fill[y].charAt(x + 1) == '#'
                    || y > 0 && fill[y - 1].charAt(x) == '#' || y < 8 && fill[y + 1].charAt(x) == '#');
                row.append(edge ? '#' : ' ');
            }
            result[y] = row.toString();
        }
        return result;
    }

    private static boolean contour(float amount, int x, int y) {
        return amount > 0 && (amount <= 1 ? HALF_OUTLINE : OUTLINE)[y].charAt(x) == '#';
    }
    private SaturationOverlay() {}

    private static FoodProperties heldFood(Player player) {
        FoodProperties food = player.getMainHandItem().get(DataComponents.FOOD);
        if (food == null) food = player.getOffhandItem().get(DataComponents.FOOD);
        return food != null && (player.getFoodData().needsFood() || food.canAlwaysEat()) ? food : null;
    }

    public static float projectedSaturation(float current, int foodLevel, FoodProperties food) {
        if (!Float.isFinite(current)) return Float.NaN;
        return Math.clamp(current + (food == null ? 0 : food.saturation()), 0,
            Math.min(20, foodLevel + (food == null ? 0 : food.nutrition())));
    }

    public static void food(GuiGraphicsExtractor gui, Player player, int index, int x, int y) {
        foodPreview(gui, player, index, x, y);
        saturation(gui, player, index, x, y);
    }

    public static void foodPreview(GuiGraphicsExtractor gui, Player player, int index, int x, int y) {
        var settings = LunarClientConfig.getSaturation();
        if (!settings.enabled || index < 0 || index >= 10) return;
        FoodProperties held = settings.icons ? heldFood(player) : null;
        int level = player.getFoodData().getFoodLevel();
        int projectedFood = Math.min(20, level + (held == null ? 0 : held.nutrition()));
        // Vanilla subsequently paints the real food over this translucent preview.
        if (held != null && projectedFood > index * 2) {
            gui.blitSprite(RenderPipelines.GUI_TEXTURED, projectedFood == index * 2 + 1 ? FOOD_HALF : FOOD,
                x, y, 9, 9, 0x70FFFFFF);
        }
    }

    public static void saturation(GuiGraphicsExtractor gui, Player player, int index, int x, int y) {
        var settings = LunarClientConfig.getSaturation();
        if (!settings.enabled || !settings.bar || index < 0 || index >= 10) return;
        FoodProperties held = settings.icons ? heldFood(player) : null;
        int level = player.getFoodData().getFoodLevel();
        float current = SaturationState.value();
        float projected = projectedSaturation(current, level, held);
        if (!Float.isFinite(current)) return;
        float solid = current - index * 2;
        float preview = projected - index * 2;
        for (int dy = 0; dy < 9; dy++) for (int dx = 0; dx < 9; dx++) {
            boolean actual = contour(solid, dx, dy);
            if (actual || contour(preview, dx, dy)) {
                int color = (settings.barColor & 0xFFFFFF) | (actual ? 0xFF000000 : 0x70000000);
                gui.fill(x + dx, y + dy, x + dx + 1, y + dy + 1, color);
            }
        }
    }

    public static void heart(GuiGraphicsExtractor gui, Player player, int index, int x, int y, boolean hardcore) {
        var settings = LunarClientConfig.getSaturation();
        if (!settings.enabled || !settings.levels || index < 0 || index * 2 >= player.getMaxHealth()
                || player.hasEffect(MobEffects.POISON) || player.hasEffect(MobEffects.WITHER)) return;
        FoodProperties held = heldFood(player);
        if (held == null) return;
        int food = Math.min(20, player.getFoodData().getFoodLevel() + held.nutrition());
        float saturation = projectedSaturation(SaturationState.value(), player.getFoodData().getFoodLevel(), held);
        if (food < 18 || !Float.isFinite(saturation)) return;
        // Estimate natural regeneration; actual healing remains controlled by the server.
        int health = (int)Math.ceil(player.getHealth());
        int projected = Math.min((int)Math.ceil(player.getMaxHealth()), health + (int)((saturation + food - 17) / 1.5f));
        if (projected <= index * 2 || health >= index * 2 + 2) return;
        gui.blitSprite(RenderPipelines.GUI_TEXTURED, Hud.HeartType.NORMAL.getSprite(hardcore, projected == index * 2 + 1, false),
            x, y, 9, 9, 0x70FFFFFF);
    }
}
