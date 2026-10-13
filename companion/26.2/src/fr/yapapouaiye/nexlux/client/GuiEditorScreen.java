/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.client.Minecraft
 *  net.minecraft.client.gui.GuiGraphicsExtractor
 *  net.minecraft.client.gui.screens.Screen
 *  net.minecraft.client.multiplayer.PlayerInfo
 *  net.minecraft.client.player.LocalPlayer
 *  net.minecraft.client.resources.sounds.SimpleSoundInstance
 *  net.minecraft.client.resources.sounds.SoundInstance
 *  net.minecraft.core.BlockPos
 *  net.minecraft.core.Holder
 *  net.minecraft.network.chat.Component
 *  net.minecraft.sounds.SoundEvents
 */
package fr.yapapouaiye.nexlux.client;

import fr.yapapouaiye.nexlux.client.LunarClientConfig;
import fr.yapapouaiye.nexlux.client.LunarClientEvents;
import java.util.Locale;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;

public class GuiEditorScreen
extends Screen {
    private final Screen parent;
    private String draggingWidget = null;
    private int dragOffsetX = 0;
    private int dragOffsetY = 0;
    private boolean snapToCenterX = false;
    private boolean snapToCenterY = false;
    private static final int SNAP_THRESHOLD = 8;
    private static final int SCREEN_MARGIN = 8;

    public GuiEditorScreen(Screen parent) {
        super((Component)Component.literal((String)"\u00c9diteur HUD Yapapouaiye Client"));
        this.parent = parent;
    }

    public void extractRenderState(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY, float partialTick) {
        guiGraphics.fill(0, 0, this.width, this.height, 0x55000000);
        int cx = this.width / 2;
        int cy = this.height / 2;
        if (this.snapToCenterX) {
            guiGraphics.fill(cx, 0, cx + 1, this.height, -16711800);
        } else {
            guiGraphics.fill(cx, 0, cx + 1, this.height, 352364799);
        }
        if (this.snapToCenterY) {
            guiGraphics.fill(0, cy, this.width, cy + 1, -16711800);
        } else {
            guiGraphics.fill(0, cy, this.width, cy + 1, 352364799);
        }
        this.renderCoordsWidget(guiGraphics, mouseX, mouseY);
        this.renderCpsWidget(guiGraphics, mouseX, mouseY);
        this.renderArmorWidget(guiGraphics, mouseX, mouseY);
        this.renderSpeedWidget(guiGraphics, mouseX, mouseY);
        this.renderFpsWidget(guiGraphics, mouseX, mouseY);
        this.renderPingWidget(guiGraphics, mouseX, mouseY);
        int barW = 280;
        int barH = 26;
        int barX = (this.width - barW) / 2;
        int barY = 8;
        guiGraphics.fill(barX, barY, barX + barW, barY + barH, -99544034);
        guiGraphics.outline(barX, barY, barW, barH, -16733953);
        guiGraphics.text(this.font, "\u00a76\u2726 \u00a7f\u00a7l\u00c9diteur HUD", barX + 8, barY + 9, 0xFFFFFF, false);
        int btnResetX = barX + barW - 144;
        int btnResetY = barY + 4;
        int btnResetW = 64;
        int btnResetH = 18;
        boolean hoverReset = mouseX >= btnResetX && mouseX <= btnResetX + btnResetW && mouseY >= btnResetY && mouseY <= btnResetY + btnResetH;
        guiGraphics.fill(btnResetX, btnResetY, btnResetX + btnResetW, btnResetY + btnResetH, hoverReset ? 1088765502 : 624837977);
        guiGraphics.outline(btnResetX, btnResetY, btnResetW, btnResetH, hoverReset ? -38037 : -12696231);
        guiGraphics.centeredText(this.font, "\u21ba Reset", btnResetX + btnResetW / 2, btnResetY + 5, hoverReset ? -30584 : -6248779);
        int btnDoneX = barX + barW - 74;
        int btnDoneY = barY + 4;
        int btnDoneW = 68;
        int btnDoneH = 18;
        boolean hoverDone = mouseX >= btnDoneX && mouseX <= btnDoneX + btnDoneW && mouseY >= btnDoneY && mouseY <= btnDoneY + btnDoneH;
        guiGraphics.fill(btnDoneX, btnDoneY, btnDoneX + btnDoneW, btnDoneY + btnDoneH, hoverDone ? -16726529 : -16733953);
        guiGraphics.centeredText(this.font, "\u2713 Valider", btnDoneX + btnDoneW / 2, btnDoneY + 5, -1);
        int tipW = 340;
        int tipH = 16;
        int tipX = (this.width - tipW) / 2;
        int tipY = this.height - 22;
        guiGraphics.fill(tipX, tipY, tipX + tipW, tipY + tipH, -1072688356);
        guiGraphics.outline(tipX, tipY, tipW, tipH, -14144195);
        guiGraphics.centeredText(this.font, "\u00a77Glisser: \u00a7fD\u00e9placer  \u00a78|  \u00a77Clic Droit: \u00a7fActiver/Couper  \u00a78|  \u00a77\u00c9chap: \u00a7fQuitter", this.width / 2, tipY + 4, 11909831);
        if (this.draggingWidget != null) {
            this.renderDragTooltip(guiGraphics, mouseX, mouseY);
        }
        super.extractRenderState(guiGraphics, mouseX, mouseY, partialTick);
    }

    private void renderCoordsWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        Minecraft mc = Minecraft.getInstance();
        int x = LunarClientConfig.getCoordsX();
        int y = LunarClientConfig.getCoordsY();
        boolean enabled = LunarClientConfig.isCoordinates();
        BlockPos pos = mc.player != null ? mc.player.blockPosition() : null;
        String coords = pos != null ? "XYZ: " + pos.getX() + " / " + pos.getY() + " / " + pos.getZ() : "XYZ: 94 / 50 / -9";
        String facing = "Direction: " + (mc.player != null ? mc.player.getDirection().name() : "NORTH");
        int pad = 4;
        int w = Math.max(this.font.width(coords), this.font.width(facing));
        Objects.requireNonNull(this.font);
        int h = 9 * 2 + 2;
        int boxX = x - pad;
        int boxY = y - pad;
        int boxW = w + pad * 2;
        int boxH = h + pad * 2;
        boolean isHovered = mouseX >= boxX && mouseX <= boxX + boxW && mouseY >= boxY && mouseY <= boxY + boxH;
        boolean isDragging = "coords".equals(this.draggingWidget);
        guiGraphics.fill(boxX, boxY, boxX + boxW, boxY + boxH, enabled ? Integer.MIN_VALUE : 1345327120);
        guiGraphics.text(this.font, coords, x, y, enabled ? -1 : 0x888888, true);
        Objects.requireNonNull(this.font);
        guiGraphics.text(this.font, facing, x, y + 9 + 2, enabled ? -4867385 : 0x666666, true);
        int outline = isDragging ? -16711800 : (isHovered ? -16733953 : (enabled ? -2143402663 : 1357200958));
        guiGraphics.outline(boxX, boxY, boxW, boxH, outline);
        if (isHovered || isDragging) {
            String badge = "\u00a7bCoordonn\u00e9es " + (enabled ? "\u00a7a[ON]" : "\u00a7c[OFF]");
            int tagY = boxY - 11 >= 2 ? boxY - 11 : boxY + boxH + 2;
            guiGraphics.text(this.font, badge, boxX, tagY, 0xFFFFFF, true);
        }
    }

    private void renderCpsWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        int x = LunarClientConfig.getCpsX();
        int y = LunarClientConfig.getCpsY();
        boolean enabled = LunarClientConfig.isCpsCounter();
        String cpsTxt = LunarClientEvents.leftClicks.size() + " | " + LunarClientEvents.rightClicks.size() + " CPS";
        int pad = 4;
        int w = this.font.width(cpsTxt);
        Objects.requireNonNull(this.font);
        int h = 9;
        int boxX = x - pad;
        int boxY = y - pad;
        int boxW = w + pad * 2;
        int boxH = h + pad * 2;
        boolean isHovered = mouseX >= boxX && mouseX <= boxX + boxW && mouseY >= boxY && mouseY <= boxY + boxH;
        boolean isDragging = "cps".equals(this.draggingWidget);
        guiGraphics.fill(boxX, boxY, boxX + boxW, boxY + boxH, enabled ? Integer.MIN_VALUE : 1345327120);
        guiGraphics.text(this.font, cpsTxt, x, y, enabled ? -1 : 0x888888, true);
        int outline = isDragging ? -16711800 : (isHovered ? -16733953 : (enabled ? -2143402663 : 1357200958));
        guiGraphics.outline(boxX, boxY, boxW, boxH, outline);
        if (isHovered || isDragging) {
            String badge = "\u00a7eCPS " + (enabled ? "\u00a7a[ON]" : "\u00a7c[OFF]");
            int tagY = boxY - 11 >= 2 ? boxY - 11 : boxY + boxH + 2;
            guiGraphics.text(this.font, badge, boxX, tagY, 0xFFFFFF, true);
        }
    }

    private void renderArmorWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        int x = LunarClientConfig.getArmorX();
        int y = LunarClientConfig.getArmorY();
        boolean enabled = LunarClientConfig.isArmorStatus();
        int pad = 2;
        int blockW = LunarClientEvents.getArmorHudBlockWidth(true);
        int textW = LunarClientEvents.getArmorHudTextWidth(true);
        boolean numbersLeft = LunarClientEvents.isArmorHudNumbersLeft(x, true);
        int boxX = numbersLeft ? x - 3 - textW - pad : x - pad;
        int boxY = y - pad;
        int boxW = blockW + pad * 2;
        int boxH = 64 + pad * 2;
        boolean isHovered = mouseX >= boxX && mouseX <= boxX + boxW && mouseY >= boxY && mouseY <= boxY + boxH;
        boolean isDragging = "armor".equals(this.draggingWidget);
        LunarClientEvents.renderArmorHud(guiGraphics, x, y, true);
        if (!enabled) {
            guiGraphics.fill(boxX, boxY, boxX + boxW, boxY + boxH, 1894071870);
        }
        int outline = isDragging ? -16711800 : (isHovered ? -16733953 : (enabled ? -2143402663 : 1357200958));
        guiGraphics.outline(boxX, boxY, boxW, boxH, outline);
        if (isHovered || isDragging) {
            String badge = "\u00a7aArmure " + (enabled ? "\u00a7a[ON]" : "\u00a7c[OFF]");
            int tagY = boxY - 11 >= 2 ? boxY - 11 : boxY + boxH + 2;
            guiGraphics.text(this.font, badge, boxX, tagY, 0xFFFFFF, true);
        }
    }

    private void renderSingleLineWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY, String widgetId, String badge, int x, int y, boolean enabled, String text, int textColor) {
        int pad = 4;
        int w = this.font.width(text);
        Objects.requireNonNull(this.font);
        int h = 9;
        int boxX = x - pad;
        int boxY = y - pad;
        int boxW = w + pad * 2;
        int boxH = h + pad * 2;
        boolean isHovered = mouseX >= boxX && mouseX <= boxX + boxW && mouseY >= boxY && mouseY <= boxY + boxH;
        boolean isDragging = widgetId.equals(this.draggingWidget);
        guiGraphics.fill(boxX, boxY, boxX + boxW, boxY + boxH, enabled ? Integer.MIN_VALUE : 1345327120);
        guiGraphics.text(this.font, text, x, y, enabled ? textColor : 0x888888, true);
        int outline = isDragging ? -16711800 : (isHovered ? -16733953 : (enabled ? -2143402663 : 1357200958));
        guiGraphics.outline(boxX, boxY, boxW, boxH, outline);
        if (isHovered || isDragging) {
            String tag = badge + " " + (enabled ? "\u00a7a[ON]" : "\u00a7c[OFF]");
            int tagY = boxY - 11 >= 2 ? boxY - 11 : boxY + boxH + 2;
            guiGraphics.text(this.font, tag, boxX, tagY, 0xFFFFFF, true);
        }
    }

    private void renderSpeedWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        Minecraft mc = Minecraft.getInstance();
        double velocity = 0.0;
        try {
            if (mc.player != null) {
                net.minecraft.world.entity.Entity ref = mc.player.getVehicle() != null ? mc.player.getVehicle() : mc.player;
                velocity = ref.getDeltaMovement().horizontalDistance() * 20.0;
            }
        }
        catch (Throwable ref) {
            // empty catch block
        }
        String txt = String.format(Locale.ROOT, "%.1f m/s", velocity);
        this.renderSingleLineWidget(guiGraphics, mouseX, mouseY, "speed", "\u00a7bVitesse", LunarClientConfig.getSpeedX(), LunarClientConfig.getSpeedY(), LunarClientConfig.isSpeed(), txt, -1);
    }

    private void renderFpsWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        Minecraft mc = Minecraft.getInstance();
        int fpsValue = 0;
        try {
            fpsValue = mc.getFps();
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        this.renderSingleLineWidget(guiGraphics, mouseX, mouseY, "fps", "\u00a7aFPS", LunarClientConfig.getFpsX(), LunarClientConfig.getFpsY(), LunarClientConfig.isFps(), fpsValue + " FPS", -1);
    }

    private void renderPingWidget(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        Minecraft mc = Minecraft.getInstance();
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
        String txt = String.valueOf(pingMs >= 0 ? Integer.valueOf(pingMs) : "--") + " ms";
        this.renderSingleLineWidget(guiGraphics, mouseX, mouseY, "ping", "\u00a7ePing", LunarClientConfig.getPingX(), LunarClientConfig.getPingY(), LunarClientConfig.isPing(), txt, -1);
    }

    private void renderDragTooltip(GuiGraphicsExtractor guiGraphics, int mouseX, int mouseY) {
        int curX = 0;
        int curY = 0;
        if ("coords".equals(this.draggingWidget)) {
            curX = LunarClientConfig.getCoordsX();
            curY = LunarClientConfig.getCoordsY();
        } else if ("cps".equals(this.draggingWidget)) {
            curX = LunarClientConfig.getCpsX();
            curY = LunarClientConfig.getCpsY();
        } else if ("armor".equals(this.draggingWidget)) {
            curX = LunarClientConfig.getArmorX();
            curY = LunarClientConfig.getArmorY();
        } else if ("speed".equals(this.draggingWidget)) {
            curX = LunarClientConfig.getSpeedX();
            curY = LunarClientConfig.getSpeedY();
        } else if ("fps".equals(this.draggingWidget)) {
            curX = LunarClientConfig.getFpsX();
            curY = LunarClientConfig.getFpsY();
        } else if ("ping".equals(this.draggingWidget)) {
            curX = LunarClientConfig.getPingX();
            curY = LunarClientConfig.getPingY();
        }
        String label = String.format("X: %d | Y: %d", curX, curY);
        int tw = this.font.width(label) + 8;
        int th = 13;
        int tx = mouseX + 12;
        int ty = mouseY - 16;
        if (tx + tw > this.width) {
            tx = mouseX - tw - 6;
        }
        if (ty < 4) {
            ty = mouseY + 14;
        }
        guiGraphics.fill(tx, ty, tx + tw, ty + th, -535817185);
        guiGraphics.outline(tx, ty, tw, th, -16711800);
        guiGraphics.text(this.font, label, tx + 4, ty + 3, -16711800, false);
    }

    private int getWidgetWidth(String id) {
        Minecraft mc = Minecraft.getInstance();
        return switch (id) {
            case "coords" -> {
                BlockPos pos = mc.player != null ? mc.player.blockPosition() : null;
                String c = pos != null ? "XYZ: " + pos.getX() + " / " + pos.getY() + " / " + pos.getZ() : "XYZ: 94 / 50 / -9";
                String f = "Direction: " + (mc.player != null ? mc.player.getDirection().name() : "NORTH");
                yield Math.max(this.font.width(c), this.font.width(f)) + 8;
            }
            case "cps" -> {
                String cps = LunarClientEvents.leftClicks.size() + " | " + LunarClientEvents.rightClicks.size() + " CPS";
                yield this.font.width(cps) + 8;
            }
            case "armor" -> LunarClientEvents.getArmorHudBlockWidth(true) + 4;
            case "speed" -> this.font.width("00.0 m/s") + 8;
            case "fps" -> this.font.width("999 FPS") + 8;
            case "ping" -> this.font.width("999 ms") + 8;
            default -> 60;
        };
    }

    private int getWidgetHeight(String id) {
        return switch (id) {
            case "coords" -> {
                Objects.requireNonNull(this.font);
                yield 9 * 2 + 10;
            }
            case "cps" -> {
                Objects.requireNonNull(this.font);
                yield 9 + 8;
            }
            case "armor" -> 68;
            case "speed" -> {
                Objects.requireNonNull(this.font);
                yield 9 + 8;
            }
            case "fps" -> {
                Objects.requireNonNull(this.font);
                yield 9 + 8;
            }
            case "ping" -> {
                Objects.requireNonNull(this.font);
                yield 9 + 8;
            }
            default -> 28;
        };
    }

    private boolean isInsideWidget(String id, double mouseX, double mouseY) {
        int x = switch (id) {
            case "coords" -> LunarClientConfig.getCoordsX() - 4;
            case "cps" -> LunarClientConfig.getCpsX() - 4;
            case "armor" -> {
                int ax = LunarClientConfig.getArmorX();
                int atw = LunarClientEvents.getArmorHudTextWidth(true);
                if (LunarClientEvents.isArmorHudNumbersLeft(ax, true)) {
                    yield ax - 3 - atw - 2;
                }
                yield ax - 2;
            }
            case "speed" -> LunarClientConfig.getSpeedX() - 4;
            case "fps" -> LunarClientConfig.getFpsX() - 4;
            case "ping" -> LunarClientConfig.getPingX() - 4;
            default -> 0;
        };
        int y = switch (id) {
            case "coords" -> LunarClientConfig.getCoordsY() - 4;
            case "cps" -> LunarClientConfig.getCpsY() - 4;
            case "armor" -> LunarClientConfig.getArmorY() - 2;
            case "speed" -> LunarClientConfig.getSpeedY() - 4;
            case "fps" -> LunarClientConfig.getFpsY() - 4;
            case "ping" -> LunarClientConfig.getPingY() - 4;
            default -> 0;
        };
        int w = this.getWidgetWidth(id);
        int h = this.getWidgetHeight(id);
        return mouseX >= (double)x && mouseX <= (double)(x + w) && mouseY >= (double)y && mouseY <= (double)(y + h);
    }

    @Override
    public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
        int barW = 280;
        int barH = 26;
        int barX = (this.width - barW) / 2;
        int barY = 8;
        if (button == 0) {
            int btnResetX = barX + barW - 144;
            int btnResetY = barY + 4;
            if (mouseX >= (double)btnResetX && mouseX <= (double)(btnResetX + 64) && mouseY >= (double)btnResetY && mouseY <= (double)(btnResetY + 18)) {
                this.playClickSound();
                LunarClientConfig.resetHudPositions();
                return true;
            }
            int btnDoneX = barX + barW - 74;
            int btnDoneY = barY + 4;
            if (mouseX >= (double)btnDoneX && mouseX <= (double)(btnDoneX + 68) && mouseY >= (double)btnDoneY && mouseY <= (double)(btnDoneY + 18)) {
                this.playClickSound();
                this.closeEditor();
                return true;
            }
            if (this.isInsideWidget("coords", mouseX, mouseY)) {
                this.draggingWidget = "coords";
                this.dragOffsetX = (int)mouseX - LunarClientConfig.getCoordsX();
                this.dragOffsetY = (int)mouseY - LunarClientConfig.getCoordsY();
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("cps", mouseX, mouseY)) {
                this.draggingWidget = "cps";
                this.dragOffsetX = (int)mouseX - LunarClientConfig.getCpsX();
                this.dragOffsetY = (int)mouseY - LunarClientConfig.getCpsY();
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("armor", mouseX, mouseY)) {
                this.draggingWidget = "armor";
                this.dragOffsetX = (int)mouseX - LunarClientConfig.getArmorX();
                this.dragOffsetY = (int)mouseY - LunarClientConfig.getArmorY();
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("speed", mouseX, mouseY)) {
                this.draggingWidget = "speed";
                this.dragOffsetX = (int)mouseX - LunarClientConfig.getSpeedX();
                this.dragOffsetY = (int)mouseY - LunarClientConfig.getSpeedY();
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("fps", mouseX, mouseY)) {
                this.draggingWidget = "fps";
                this.dragOffsetX = (int)mouseX - LunarClientConfig.getFpsX();
                this.dragOffsetY = (int)mouseY - LunarClientConfig.getFpsY();
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("ping", mouseX, mouseY)) {
                this.draggingWidget = "ping";
                this.dragOffsetX = (int)mouseX - LunarClientConfig.getPingX();
                this.dragOffsetY = (int)mouseY - LunarClientConfig.getPingY();
                this.playClickSound();
                return true;
            }
        } else if (button == 1) {
            if (this.isInsideWidget("coords", mouseX, mouseY)) {
                LunarClientConfig.setCoordinates(!LunarClientConfig.isCoordinates(), true);
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("cps", mouseX, mouseY)) {
                LunarClientConfig.setCpsCounter(!LunarClientConfig.isCpsCounter(), true);
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("armor", mouseX, mouseY)) {
                LunarClientConfig.setArmorStatus(!LunarClientConfig.isArmorStatus(), true);
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("speed", mouseX, mouseY)) {
                LunarClientConfig.setSpeed(!LunarClientConfig.isSpeed(), true);
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("fps", mouseX, mouseY)) {
                LunarClientConfig.setFps(!LunarClientConfig.isFps(), true);
                this.playClickSound();
                return true;
            }
            if (this.isInsideWidget("ping", mouseX, mouseY)) {
                LunarClientConfig.setPing(!LunarClientConfig.isPing(), true);
                this.playClickSound();
                return true;
            }
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseDragged(net.minecraft.client.input.MouseButtonEvent event, double dragX, double dragY) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
        if (this.draggingWidget != null) {
            int w = this.getWidgetWidth(this.draggingWidget);
            int h = this.getWidgetHeight(this.draggingWidget);
            int targetX = (int)mouseX - this.dragOffsetX;
            int targetY = (int)mouseY - this.dragOffsetY;
            if (Math.abs(targetX - 8) < 8) {
                targetX = 8;
            } else if (Math.abs(targetX + w - (this.width - 8)) < 8) {
                targetX = this.width - 8 - w;
            }
            if (Math.abs(targetY - 8) < 8) {
                targetY = 8;
            } else if (Math.abs(targetY + h - (this.height - 8)) < 8) {
                targetY = this.height - 8 - h;
            }
            int centerX = this.width / 2;
            int centerY = this.height / 2;
            boolean bl = this.snapToCenterX = Math.abs(targetX + w / 2 - centerX) < 8;
            if (this.snapToCenterX) {
                targetX = centerX - w / 2;
            }
            boolean bl2 = this.snapToCenterY = Math.abs(targetY + h / 2 - centerY) < 8;
            if (this.snapToCenterY) {
                targetY = centerY - h / 2;
            }
            targetX = Math.max(2, Math.min(this.width - w - 2, targetX));
            targetY = Math.max(2, Math.min(this.height - h - 2, targetY));
            if ("coords".equals(this.draggingWidget)) {
                LunarClientConfig.setCoordsX(targetX);
                LunarClientConfig.setCoordsY(targetY);
            } else if ("cps".equals(this.draggingWidget)) {
                LunarClientConfig.setCpsX(targetX);
                LunarClientConfig.setCpsY(targetY);
            } else if ("armor".equals(this.draggingWidget)) {
                LunarClientConfig.setArmorX(targetX);
                LunarClientConfig.setArmorY(targetY);
            } else if ("speed".equals(this.draggingWidget)) {
                LunarClientConfig.setSpeedX(targetX);
                LunarClientConfig.setSpeedY(targetY);
            } else if ("fps".equals(this.draggingWidget)) {
                LunarClientConfig.setFpsX(targetX);
                LunarClientConfig.setFpsY(targetY);
            } else if ("ping".equals(this.draggingWidget)) {
                LunarClientConfig.setPingX(targetX);
                LunarClientConfig.setPingY(targetY);
            }
            return true;
        }
        return super.mouseDragged(event, dragX, dragY);
    }

    @Override
    public boolean mouseReleased(net.minecraft.client.input.MouseButtonEvent event) {
        int button = event.button();
        if (this.draggingWidget != null) {
            this.draggingWidget = null;
            this.snapToCenterX = false;
            this.snapToCenterY = false;
            LunarClientConfig.save();
            return true;
        }
        return super.mouseReleased(event);
    }

    @Override
    public boolean keyPressed(net.minecraft.client.input.KeyEvent event) {
        int keyCode = event.key();
        if (keyCode == 256 || keyCode == 344) {
            this.closeEditor();
            return true;
        }
        return super.keyPressed(event);
    }

    private void closeEditor() {
        LunarClientConfig.save();
        if (this.minecraft != null) {
            this.minecraft.gui.setScreen(this.parent);
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

    public boolean isPauseScreen() {
        return false;
    }
}

