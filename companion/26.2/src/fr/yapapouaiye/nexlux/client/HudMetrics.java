package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;

/** All renderers and the editor use the same outer rectangle, including padding. */
public final class HudMetrics {
    public static final String[] IDS = {"coords", "cps", "armor", "speed", "fps", "ping", "potions"};
    private HudMetrics() {}
    private static Object speedPlayer;
    private static int speedTick = Integer.MIN_VALUE;
    private static String speedText = "0.0 m/s";

    public static String[] coordinateLines() {
        Minecraft mc = Minecraft.getInstance();
        BlockPos pos = mc.player == null ? null : mc.player.blockPosition();
        int x = pos == null ? 94 : pos.getX(), y = pos == null ? 50 : pos.getY(), z = pos == null ? -9 : pos.getZ();
        String coordinates = "XYZ: " + x + " / " + y + " / " + z;
        String facing = "Direction: " + (mc.player == null ? "NORTH" : mc.player.getDirection().name());
        int available = mc.getWindow() == null ? 838 : Math.max(1, mc.getWindow().getGuiScaledWidth() - 16);
        if (mc.font != null && Math.max(mc.font.width(coordinates), mc.font.width(facing)) > available) {
            return new String[]{"X: " + x, "Y: " + y, "Z: " + z, mc.player == null ? "NORTH" : mc.player.getDirection().name()};
        }
        return new String[]{coordinates, facing};
    }

    public static int width(String id) {
        if (ExtraHud.supports(id)) return ExtraHud.width(id);
        Minecraft mc = Minecraft.getInstance();
        if ("armor".equals(id)) return LunarClientEvents.getArmorHudBlockWidth(true) + 4;
        if (mc.font == null) return 80;
        if ("coords".equals(id)) {
            int width = 0;
            for (String line : coordinateLines()) width = Math.max(width, mc.font.width(line));
            return width + 8;
        }
        return mc.font.width(counterText(id)) + 8;
    }

    public static String counterText(String id) {
        Minecraft mc = Minecraft.getInstance();
        if ("cps".equals(id)) return LunarClientEvents.leftClicks.size() + " | " + LunarClientEvents.rightClicks.size() + " CPS";
        if ("fps".equals(id)) return mc.getFps() + " FPS";
        if ("speed".equals(id)) {
            int tick = mc.player == null ? 0 : mc.player.tickCount;
            if (speedPlayer != mc.player || speedTick != tick) {
                var entity = mc.player == null ? null : mc.player.getVehicle() != null ? mc.player.getVehicle() : mc.player;
                speedText = String.format(java.util.Locale.ROOT, "%.1f m/s", entity == null ? 0 : entity.getDeltaMovement().horizontalDistance() * 20);
                speedPlayer = mc.player;
                speedTick = tick;
            }
            return speedText;
        }
        var info = mc.player == null || mc.getConnection() == null ? null : mc.getConnection().getPlayerInfo(mc.player.getUUID());
        return (info == null || info.getLatency() < 0 ? "--" : Integer.toString(info.getLatency())) + " ms";
    }

    public static int height(String id) {
        if (ExtraHud.supports(id)) return ExtraHud.height(id);
        return "coords".equals(id) ? coordinateLines().length * 11 + 6 : "armor".equals(id) ? 68 : 17;
    }
    public static int padding(String id) { return ExtraHud.supports(id) ? 0 : "armor".equals(id) ? 2 : 4; }
    public static int x(String id) {
        if (ExtraHud.supports(id)) { ExtraHud.fit(id); return ExtraHud.settings(id).x; }
        return switch (id) {
            case "coords" -> LunarClientConfig.getCoordsX();
            case "cps" -> LunarClientConfig.getCpsX();
            case "armor" -> LunarClientConfig.getArmorX();
            case "speed" -> LunarClientConfig.getSpeedX();
            case "fps" -> LunarClientConfig.getFpsX();
            default -> LunarClientConfig.getPingX();
        };
    }
    public static int y(String id) {
        if (ExtraHud.supports(id)) { ExtraHud.fit(id); return ExtraHud.settings(id).y; }
        return switch (id) {
            case "coords" -> LunarClientConfig.getCoordsY();
            case "cps" -> LunarClientConfig.getCpsY();
            case "armor" -> LunarClientConfig.getArmorY();
            case "speed" -> LunarClientConfig.getSpeedY();
            case "fps" -> LunarClientConfig.getFpsY();
            default -> LunarClientConfig.getPingY();
        };
    }
}
