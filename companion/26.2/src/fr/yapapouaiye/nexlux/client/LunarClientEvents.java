/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.client.Minecraft
 *  net.minecraft.client.gui.Font
 *  net.minecraft.client.gui.GuiGraphicsExtractor
 *  net.minecraft.client.gui.screens.Screen
 *  net.minecraft.client.multiplayer.PlayerInfo
 *  net.minecraft.client.player.LocalPlayer
 *  net.minecraft.core.BlockPos
 *  net.minecraft.core.NonNullList
 *  net.minecraft.world.effect.MobEffectInstance
 *  net.minecraft.world.effect.MobEffects
 *  net.minecraft.world.item.ItemStack
 *  net.minecraft.world.item.Items
 *  net.neoforged.bus.api.SubscribeEvent
 *  net.neoforged.neoforge.client.event.ClientTickEvent$Post
 *  net.neoforged.neoforge.client.event.ComputeFovModifierEvent
 *  net.neoforged.neoforge.client.event.ViewportEvent$RenderFog
 *  org.lwjgl.glfw.GLFW
 */
package fr.yapapouaiye.nexlux.client;

import fr.yapapouaiye.nexlux.client.GuiEditorScreen;
import fr.yapapouaiye.nexlux.client.LunarClientConfig;
import fr.yapapouaiye.nexlux.client.LunarClientScreen;
import fr.yapapouaiye.nexlux.client.LunarKeyBindings;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.NonNullList;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.ComputeFovModifierEvent;
import net.neoforged.neoforge.client.event.ViewportEvent;
import org.lwjgl.glfw.GLFW;

public final class LunarClientEvents {
    private static float currentZoom = 0.0f;
    private static boolean wasLeftDown = false;
    private static boolean wasRightDown = false;
    public static final List<Long> leftClicks = new ArrayList<Long>();
    public static final List<Long> rightClicks = new ArrayList<Long>();

    private LunarClientEvents() {
    }

    @SubscribeEvent
    public static void onClientTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            return;
        }
        if (LunarKeyBindings.OPEN_LUNAR_MENU.consumeClick()) {
            if (mc.gui.screen() == null) {
                mc.gui.setScreen((Screen)new LunarClientScreen());
            } else if (mc.gui.screen() instanceof LunarClientScreen) {
                mc.gui.setScreen(null);
            }
        }
        if (LunarKeyBindings.TOGGLE_FULLBRIGHT.consumeClick()) {
            LunarClientConfig.setFullBright(!LunarClientConfig.isFullBright(), true);
        }
        if (LunarKeyBindings.TOGGLE_NIGHT_VISION.consumeClick()) {
            LunarClientConfig.setNightVision(!LunarClientConfig.isNightVision(), true);
        }
        if (LunarKeyBindings.TOGGLE_NO_FOG.consumeClick()) {
            LunarClientConfig.setNoFog(!LunarClientConfig.isNoFog(), true);
        }
        if (LunarClientConfig.isFullBright() && mc.options != null && (Double)mc.options.gamma().get() < 10.0) {
            mc.options.gamma() .set(100.0);
        }
        if (LunarClientConfig.isNightVision()) {
            MobEffectInstance current = mc.player.getEffect(MobEffects.NIGHT_VISION);
            if (current == null || current.getDuration() < 60000) {
                mc.player.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, 999999, 0, false, false, false));
            }
        } else if (mc.player.hasEffect(MobEffects.NIGHT_VISION)) {
            mc.player.removeEffect(MobEffects.NIGHT_VISION);
        }
        boolean isZoomDown = LunarKeyBindings.KEY_ZOOM.isDown() && mc.gui.screen() == null;
        float targetZoom = LunarClientConfig.isZoom() && isZoomDown ? 1.0f : 0.0f;
        currentZoom += (targetZoom - currentZoom) * 0.45f;
        if (Math.abs(targetZoom - currentZoom) < 0.01f) {
            currentZoom = targetZoom;
        }
        try {
            long win = mc.getWindow().handle();
            boolean leftDown = GLFW.glfwGetMouseButton((long)win, (int)0) == 1;
            boolean rightDown = GLFW.glfwGetMouseButton((long)win, (int)1) == 1;
            long now = System.currentTimeMillis();
            if (leftDown && !wasLeftDown && mc.gui.screen() == null) {
                leftClicks.add(now);
            }
            if (rightDown && !wasRightDown && mc.gui.screen() == null) {
                rightClicks.add(now);
            }
            wasLeftDown = leftDown;
            wasRightDown = rightDown;
            leftClicks.removeIf(t -> now - t > 1000L);
            rightClicks.removeIf(t -> now - t > 1000L);
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    @SubscribeEvent
    public static void onComputeFov(ComputeFovModifierEvent event) {
        if (currentZoom > 0.005f) {
            float zoomMultiplier = 1.0f - currentZoom * 0.75f;
            event.setNewFovModifier(event.getFovModifier() * zoomMultiplier);
        }
    }

    public static void renderHud(GuiGraphicsExtractor guiGraphics) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null || mc.font == null) {
            return;
        }
        if (mc.gui.screen() instanceof LunarClientScreen || mc.gui.screen() instanceof GuiEditorScreen) {
            return;
        }
        int pad = 4;
        if (LunarClientConfig.isCoordinates()) {
            BlockPos pos = mc.player.blockPosition();
            String coords = "XYZ: " + pos.getX() + " / " + pos.getY() + " / " + pos.getZ();
            String facing = "Direction: " + mc.player.getDirection().name();
            int x = LunarClientConfig.getCoordsX();
            int y = LunarClientConfig.getCoordsY();
            int w = Math.max(mc.font.width(coords), mc.font.width(facing));
            Objects.requireNonNull(mc.font);
            int h = 9 * 2 + 2;
            guiGraphics.fill(x - pad, y - pad, x + w + pad, y + h + pad, Integer.MIN_VALUE);
            guiGraphics.text(mc.font, coords, x, y, -1, true);
            Font font = mc.font;
            Objects.requireNonNull(mc.font);
            guiGraphics.text(font, facing, x, y + 9 + 2, -4867385, true);
        }
        if (LunarClientConfig.isCpsCounter()) {
            int cpsX = LunarClientConfig.getCpsX();
            int cpsY = LunarClientConfig.getCpsY();
            String cpsTxt = leftClicks.size() + " | " + rightClicks.size() + " CPS";
            int cw = mc.font.width(cpsTxt);
            Objects.requireNonNull(mc.font);
            int ch = 9;
            guiGraphics.fill(cpsX - pad, cpsY - pad, cpsX + cw + pad, cpsY + ch + pad, Integer.MIN_VALUE);
            guiGraphics.text(mc.font, cpsTxt, cpsX, cpsY, -1, true);
        }
        if (LunarClientConfig.isArmorStatus()) {
            LunarClientEvents.renderArmorHud(guiGraphics, LunarClientConfig.getArmorX(), LunarClientConfig.getArmorY(), false);
        }
        if (LunarClientConfig.isSpeed()) {
            int sx = LunarClientConfig.getSpeedX();
            int sy = LunarClientConfig.getSpeedY();
            double velocity = 0.0;
            try {
                net.minecraft.world.entity.Entity ref = mc.player.getVehicle() != null ? mc.player.getVehicle() : mc.player;
                velocity = ref.getDeltaMovement().horizontalDistance() * 20.0;
            }
            catch (Throwable ref) {
                // empty catch block
            }
            String speedTxt = String.format(Locale.ROOT, "%.1f m/s", velocity);
            int sw = mc.font.width(speedTxt);
            Objects.requireNonNull(mc.font);
            int sh = 9;
            guiGraphics.fill(sx - pad, sy - pad, sx + sw + pad, sy + sh + pad, Integer.MIN_VALUE);
            guiGraphics.text(mc.font, speedTxt, sx, sy, -1, true);
        }
        if (LunarClientConfig.isFps()) {
            int fx = LunarClientConfig.getFpsX();
            int fy = LunarClientConfig.getFpsY();
            String fpsTxt = mc.getFps() + " FPS";
            int fw = mc.font.width(fpsTxt);
            Objects.requireNonNull(mc.font);
            int fh = 9;
            guiGraphics.fill(fx - pad, fy - pad, fx + fw + pad, fy + fh + pad, Integer.MIN_VALUE);
            guiGraphics.text(mc.font, fpsTxt, fx, fy, -1, true);
        }
        if (LunarClientConfig.isPing()) {
            int px = LunarClientConfig.getPingX();
            int py = LunarClientConfig.getPingY();
            int pingMs = -1;
            try {
                PlayerInfo info;
                if (mc.getConnection() != null && mc.player != null && (info = mc.getConnection().getPlayerInfo(mc.player.getUUID())) != null) {
                    pingMs = info.getLatency();
                }
            }
            catch (Throwable info) {
                // empty catch block
            }
            String pingTxt = String.valueOf(pingMs >= 0 ? Integer.valueOf(pingMs) : "--") + " ms";
            int pw = mc.font.width(pingTxt);
            Objects.requireNonNull(mc.font);
            int ph = 9;
            guiGraphics.fill(px - pad, py - pad, px + pw + pad, py + ph + pad, Integer.MIN_VALUE);
            guiGraphics.text(mc.font, pingTxt, px, py, -1, true);
        }
    }

    private static ItemStack damagedPreview(ItemStack stack, int damage) {
        try {
            stack.setDamageValue(damage);
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return stack;
    }

    private static ItemStack[] resolveArmorRows(boolean isPreview) {
        Minecraft mc = Minecraft.getInstance();
        net.minecraft.world.entity.EquipmentSlot[] slots = {net.minecraft.world.entity.EquipmentSlot.HEAD, net.minecraft.world.entity.EquipmentSlot.CHEST, net.minecraft.world.entity.EquipmentSlot.LEGS, net.minecraft.world.entity.EquipmentSlot.FEET};
        ItemStack[] fallback = new ItemStack[]{LunarClientEvents.damagedPreview(Items.NETHERITE_HELMET.getDefaultInstance(), 120), LunarClientEvents.damagedPreview(Items.NETHERITE_CHESTPLATE.getDefaultInstance(), 300), LunarClientEvents.damagedPreview(Items.NETHERITE_LEGGINGS.getDefaultInstance(), 200), LunarClientEvents.damagedPreview(Items.NETHERITE_BOOTS.getDefaultInstance(), 60)};
        ItemStack[] rows = new ItemStack[]{ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.EMPTY};
        for (int i = 0; i < 4; ++i) {
            int slotIdx = 3 - i;
            ItemStack stack = ItemStack.EMPTY;
            if (mc != null && mc.player != null) {
                stack = mc.player.getItemBySlot(slots[i]);
            }
            if (stack == null || stack.isEmpty()) {
                if (!isPreview) continue;
                stack = fallback[i];
            }
            rows[i] = stack == null ? ItemStack.EMPTY : stack;
        }
        return rows;
    }

    private static int armorRemaining(ItemStack stack) {
        if (stack == null || stack.isEmpty()) {
            return -1;
        }
        try {
            int max = stack.getMaxDamage();
            if (max <= 0) {
                return -1;
            }
            return Math.max(0, max - stack.getDamageValue());
        }
        catch (Throwable ignored) {
            return -1;
        }
    }

    private static int armorDurabilityColor(int remaining, int max) {
        if (max <= 0) {
            return -1;
        }
        float pct = (float)remaining / (float)max;
        if (pct > 0.6f) {
            return -11141291;
        }
        if (pct > 0.3f) {
            return -171;
        }
        return -43691;
    }

    public static int getArmorHudTextWidth(boolean isPreview) {
        if (!LunarClientConfig.isArmorNumbers()) {
            return 0;
        }
        Minecraft mc = Minecraft.getInstance();
        if (mc == null || mc.font == null) {
            return 30;
        }
        int w = 0;
        for (ItemStack stack : LunarClientEvents.resolveArmorRows(isPreview)) {
            int remaining = LunarClientEvents.armorRemaining(stack);
            if (remaining < 0) continue;
            w = Math.max(w, mc.font.width(String.valueOf(remaining)));
        }
        return w;
    }

    public static int getArmorHudBlockWidth(boolean isPreview) {
        int textW = LunarClientEvents.getArmorHudTextWidth(isPreview);
        return 16 + (textW > 0 ? 3 + textW : 0);
    }

    public static boolean isArmorHudNumbersLeft(int x, boolean isPreview) {
        int textW = LunarClientEvents.getArmorHudTextWidth(isPreview);
        if (textW <= 0) {
            return false;
        }
        Minecraft mc = Minecraft.getInstance();
        int screenW = 854;
        try {
            if (mc != null && mc.getWindow() != null) {
                screenW = mc.getWindow().getGuiScaledWidth();
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return x + 16 + 3 + textW > screenW - 2;
    }

    public static void renderArmorHud(GuiGraphicsExtractor guiGraphics, int x, int y, boolean isPreview) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.font == null) {
            return;
        }
        int pad = 2;
        boolean showNumbers = LunarClientConfig.isArmorNumbers();
        ItemStack[] rows = LunarClientEvents.resolveArmorRows(isPreview);
        int textW = showNumbers ? LunarClientEvents.getArmorHudTextWidth(isPreview) : 0;
        int blockW = 16 + (textW > 0 ? 3 + textW : 0);
        boolean numbersLeft = textW > 0 && LunarClientEvents.isArmorHudNumbersLeft(x, isPreview);
        int boxX = numbersLeft ? x - 3 - textW - pad : x - pad;
        guiGraphics.fill(boxX, y - pad, boxX + blockW + pad * 2, y + 64 + pad, 0x75000000);
        for (int i = 0; i < 4; ++i) {
            int remaining;
            ItemStack stack = rows[i];
            if (stack == null || stack.isEmpty()) continue;
            int itemY = y + i * 16;
            guiGraphics.item(stack, x, itemY);
            guiGraphics.itemDecorations(mc.font, stack, x, itemY);
            if (!showNumbers || (remaining = LunarClientEvents.armorRemaining(stack)) < 0) continue;
            String txt = String.valueOf(remaining);
            int tx = numbersLeft ? x - 3 - mc.font.width(txt) : x + 19;
            int color = LunarClientEvents.armorDurabilityColor(remaining, stack.getMaxDamage());
            guiGraphics.text(mc.font, txt, tx, itemY + 4, color, true);
        }
    }

    @SubscribeEvent
    public static void onRenderFog(ViewportEvent.RenderFog event) {
        if (LunarClientConfig.isNoFog()) {
            event.setNearPlaneDistance(10000.0f);
            event.setFarPlaneDistance(20000.0f);

        }
    }
}

