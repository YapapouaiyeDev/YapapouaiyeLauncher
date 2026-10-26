/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.gson.Gson
 *  com.google.gson.GsonBuilder
 *  net.minecraft.client.Minecraft
 *  net.minecraft.client.Options
 *  net.minecraft.network.chat.Component
 *  net.minecraft.world.effect.MobEffectInstance
 *  net.minecraft.world.effect.MobEffects
 *  org.slf4j.Logger
 *  org.slf4j.LoggerFactory
 */
package fr.yapapouaiye.nexlux.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.Reader;
import java.nio.file.Path;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LunarClientConfig {
    private static final Logger LOGGER = LoggerFactory.getLogger((String)"YapapouaiyeClient");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static boolean fullBright = true;
    private static boolean nightVision = false;
    private static boolean noFog = false;
    private static boolean fpsBoost = false;
    private static boolean zoom = true;
    private static boolean armorStatus = true;
    private static boolean armorNumbers = true;
    private static boolean keystrokes = true;
    private static boolean cpsCounter = true;
    private static boolean coordinates = true;
    private static boolean speed = true;
    private static boolean fps = true;
    private static boolean ping = true;
    private static int coordsX = 8;
    private static int coordsY = 8;
    private static int cpsX = 8;
    private static int cpsY = 40;
    private static int armorX = 8;
    private static int armorY = 62;
    private static int speedX = 8;
    private static int speedY = 134;
    private static int fpsX = 8;
    private static int fpsY = 152;
    private static int pingX = 8;
    private static int pingY = 170;
    private static int hudReferenceWidth;
    private static int hudReferenceHeight;
    private static int[] hudAnchorX;
    private static int[] hudAnchorY;
    private static ClientMenuWindow clientMenu = new ClientMenuWindow();
    private static ExtraHudSettings potionTimer = new ExtraHudSettings();
    private static ExtraHudSettings saturation = defaultSaturation();

    private static ExtraHudSettings defaultSaturation() {
        ExtraHudSettings settings = new ExtraHudSettings();
        settings.y = 140;
        return settings;
    }
    public static ExtraHudSettings getPotionTimer() { return potionTimer; }
    public static ExtraHudSettings getSaturation() { return saturation; }
    private static File configFile;
    private static File legacyConfigFile;

    private LunarClientConfig() {
    }

    public static void init(Path gameDirPath) {
        File configDir = gameDirPath.resolve("config").toFile();
        if (!configDir.exists()) {
            configDir.mkdirs();
        }
        configFile = new File(configDir, "yapapouaiye_client.json");
        legacyConfigFile = new File(configDir, "lunar_client.json");
        LunarClientConfig.load();
    }

    public static boolean isFullBright() {
        return fullBright;
    }

    public static void setFullBright(boolean enable, boolean notifyPlayer) {
        fullBright = enable;
        LunarClientConfig.applyFullBright(enable);
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("FullBright (Gamma)", enable);
        }
    }

    public static boolean isNightVision() {
        return nightVision;
    }

    public static void setNightVision(boolean enable, boolean notifyPlayer) {
        nightVision = enable;
        LunarClientConfig.applyNightVision(enable);
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Vision Nocturne", enable);
        }
    }

    public static boolean isNoFog() {
        return noFog;
    }

    public static void setNoFog(boolean enable, boolean notifyPlayer) {
        noFog = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Anti-Brouillard (NoFog)", enable);
        }
    }

    public static boolean isFpsBoost() {
        return fpsBoost;
    }

    public static void setFpsBoost(boolean enable, boolean notifyPlayer) {
        fpsBoost = enable;
        LunarClientConfig.save();
        if (enable) {
            System.gc();
        }
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Boost Performance (FPS)", enable);
        }
    }

    public static boolean isZoom() {
        return zoom;
    }

    public static void setZoom(boolean enable, boolean notifyPlayer) {
        zoom = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Zoom Rapide [C]", enable);
        }
    }

    public static boolean isArmorStatus() {
        return armorStatus;
    }

    public static void setArmorStatus(boolean enable, boolean notifyPlayer) {
        armorStatus = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Armor Status HUD", enable);
        }
    }

    public static boolean isArmorNumbers() {
        return armorNumbers;
    }

    public static void setArmorNumbers(boolean enable, boolean notifyPlayer) {
        armorNumbers = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Durabilit\u00e9 chiffr\u00e9e", enable);
        }
    }

    public static boolean isKeystrokes() {
        return keystrokes;
    }

    public static void setKeystrokes(boolean enable, boolean notifyPlayer) {
        keystrokes = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Keystrokes HUD", enable);
        }
    }

    public static boolean isCpsCounter() {
        return cpsCounter;
    }

    public static void setCpsCounter(boolean enable, boolean notifyPlayer) {
        cpsCounter = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Compteur CPS", enable);
        }
    }

    public static boolean isCoordinates() {
        return coordinates;
    }

    public static void setCoordinates(boolean enable, boolean notifyPlayer) {
        coordinates = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Coordonn\u00e9es HUD", enable);
        }
    }

    public static boolean isSpeed() {
        return speed;
    }

    public static void setSpeed(boolean enable, boolean notifyPlayer) {
        speed = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Vitesse HUD", enable);
        }
    }

    public static boolean isFps() {
        return fps;
    }

    public static void setFps(boolean enable, boolean notifyPlayer) {
        fps = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("FPS HUD", enable);
        }
    }

    public static boolean isPing() {
        return ping;
    }

    public static void setPing(boolean enable, boolean notifyPlayer) {
        ping = enable;
        LunarClientConfig.save();
        if (notifyPlayer) {
            LunarClientConfig.sendActionNotification("Ping HUD", enable);
        }
    }

    public static int getCoordsX() {
        ensureHudViewport();
        return coordsX;
    }

    public static void setCoordsX(int x) {
        ensureHudViewport();
        coordsX = x;
        hudAnchorX[0] = HudLayout.anchor(coordsX - HudMetrics.padding("coords"), HudMetrics.width("coords"), hudReferenceWidth);
    }

    public static int getCoordsY() {
        ensureHudViewport();
        return coordsY;
    }

    public static void setCoordsY(int y) {
        ensureHudViewport();
        coordsY = y;
        hudAnchorY[0] = HudLayout.anchor(coordsY - HudMetrics.padding("coords"), HudMetrics.height("coords"), hudReferenceHeight);
    }

    public static void setCoordsPos(int x, int y) {
        setCoordsX(x);
        setCoordsY(y);
        LunarClientConfig.save();
    }

    public static int getCpsX() {
        ensureHudViewport();
        return cpsX;
    }

    public static void setCpsX(int x) {
        ensureHudViewport();
        cpsX = x;
        hudAnchorX[1] = HudLayout.anchor(cpsX - HudMetrics.padding("cps"), HudMetrics.width("cps"), hudReferenceWidth);
    }

    public static int getCpsY() {
        ensureHudViewport();
        return cpsY;
    }

    public static void setCpsY(int y) {
        ensureHudViewport();
        cpsY = y;
        hudAnchorY[1] = HudLayout.anchor(cpsY - HudMetrics.padding("cps"), HudMetrics.height("cps"), hudReferenceHeight);
    }

    public static void setCpsPos(int x, int y) {
        setCpsX(x);
        setCpsY(y);
        LunarClientConfig.save();
    }

    public static int getArmorX() {
        ensureHudViewport();
        return armorX;
    }

    public static void setArmorX(int x) {
        ensureHudViewport();
        armorX = x;
        hudAnchorX[2] = HudLayout.anchor(armorX - HudMetrics.padding("armor"), HudMetrics.width("armor"), hudReferenceWidth);
    }

    public static int getArmorY() {
        ensureHudViewport();
        return armorY;
    }

    public static void setArmorY(int y) {
        ensureHudViewport();
        armorY = y;
        hudAnchorY[2] = HudLayout.anchor(armorY - HudMetrics.padding("armor"), HudMetrics.height("armor"), hudReferenceHeight);
    }

    public static void setArmorPos(int x, int y) {
        setArmorX(x);
        setArmorY(y);
        LunarClientConfig.save();
    }

    public static int getSpeedX() {
        ensureHudViewport();
        return speedX;
    }

    public static void setSpeedX(int x) {
        ensureHudViewport();
        speedX = x;
        hudAnchorX[3] = HudLayout.anchor(speedX - HudMetrics.padding("speed"), HudMetrics.width("speed"), hudReferenceWidth);
    }

    public static int getSpeedY() {
        ensureHudViewport();
        return speedY;
    }

    public static void setSpeedY(int y) {
        ensureHudViewport();
        speedY = y;
        hudAnchorY[3] = HudLayout.anchor(speedY - HudMetrics.padding("speed"), HudMetrics.height("speed"), hudReferenceHeight);
    }

    public static void setSpeedPos(int x, int y) {
        setSpeedX(x);
        setSpeedY(y);
        LunarClientConfig.save();
    }

    public static int getFpsX() {
        ensureHudViewport();
        return fpsX;
    }

    public static void setFpsX(int x) {
        ensureHudViewport();
        fpsX = x;
        hudAnchorX[4] = HudLayout.anchor(fpsX - HudMetrics.padding("fps"), HudMetrics.width("fps"), hudReferenceWidth);
    }

    public static int getFpsY() {
        ensureHudViewport();
        return fpsY;
    }

    public static void setFpsY(int y) {
        ensureHudViewport();
        fpsY = y;
        hudAnchorY[4] = HudLayout.anchor(fpsY - HudMetrics.padding("fps"), HudMetrics.height("fps"), hudReferenceHeight);
    }

    public static void setFpsPos(int x, int y) {
        setFpsX(x);
        setFpsY(y);
        LunarClientConfig.save();
    }

    public static int getPingX() {
        ensureHudViewport();
        return pingX;
    }

    public static void setPingX(int x) {
        ensureHudViewport();
        pingX = x;
        hudAnchorX[5] = HudLayout.anchor(pingX - HudMetrics.padding("ping"), HudMetrics.width("ping"), hudReferenceWidth);
    }

    public static int getPingY() {
        ensureHudViewport();
        return pingY;
    }

    public static void setPingY(int y) {
        ensureHudViewport();
        pingY = y;
        hudAnchorY[5] = HudLayout.anchor(pingY - HudMetrics.padding("ping"), HudMetrics.height("ping"), hudReferenceHeight);
    }

    public static void setPingPos(int x, int y) {
        setPingX(x);
        setPingY(y);
        LunarClientConfig.save();
    }

    public static ClientMenuWindow getClientMenu() { return clientMenu; }

    public static void ensureHudViewport() {
        Minecraft mc = Minecraft.getInstance();
        if (mc == null || mc.getWindow() == null) return;
        int width = mc.getWindow().getGuiScaledWidth();
        int height = mc.getWindow().getGuiScaledHeight();
        boolean anchorsKnown = hudAnchorX != null && hudAnchorX.length == 6 && hudAnchorY != null && hudAnchorY.length == 6;
        if (width < 1 || height < 1) return;
        int[] xs = {coordsX, cpsX, armorX, speedX, fpsX, pingX};
        int[] ys = {coordsY, cpsY, armorY, speedY, fpsY, pingY};
        if (anchorsKnown && width == hudReferenceWidth && height == hudReferenceHeight) {
            boolean inside = true;
            for (int i = 0; i < xs.length; i++) {
                String id = HudMetrics.IDS[i];
                int pad = HudMetrics.padding(id);
                inside &= xs[i] - pad >= 4 && ys[i] - pad >= 4
                    && xs[i] - pad + HudMetrics.width(id) <= width - 4
                    && ys[i] - pad + HudMetrics.height(id) <= height - 4;
            }
            if (inside) return;
        }
        int oldWidth = hudReferenceWidth > 0 ? hudReferenceWidth : width;
        int oldHeight = hudReferenceHeight > 0 ? hudReferenceHeight : height;
        if (hudReferenceWidth == 0 || hudReferenceHeight == 0) {
            // Legacy files contain absolute pixels only. Include offscreen positions
            // when inferring the old canvas, then bring them back inside the window.
            for (int i = 0; i < xs.length; i++) {
                if (hudReferenceWidth == 0) oldWidth = Math.max(oldWidth, xs[i] + HudMetrics.width(HudMetrics.IDS[i]) + 4);
                if (hudReferenceHeight == 0) oldHeight = Math.max(oldHeight, ys[i] + HudMetrics.height(HudMetrics.IDS[i]) + 4);
            }
        }
        if (!anchorsKnown) {
            hudAnchorX = new int[6];
            hudAnchorY = new int[6];
            for (int i = 0; i < xs.length; i++) {
                String id = HudMetrics.IDS[i];
                int pad = HudMetrics.padding(id);
                hudAnchorX[i] = HudLayout.anchor(xs[i] - pad, HudMetrics.width(id), oldWidth);
                hudAnchorY[i] = HudLayout.anchor(ys[i] - pad, HudMetrics.height(id), oldHeight);
            }
        }
        for (int i = 0; i < xs.length; i++) {
            String id = HudMetrics.IDS[i];
            int pad = HudMetrics.padding(id);
            xs[i] = HudLayout.reflow(xs[i] - pad, HudMetrics.width(id), oldWidth, width, hudAnchorX[i]) + pad;
            ys[i] = HudLayout.reflow(ys[i] - pad, HudMetrics.height(id), oldHeight, height, hudAnchorY[i]) + pad;
        }
        coordsX = xs[0]; cpsX = xs[1]; armorX = xs[2]; speedX = xs[3]; fpsX = xs[4]; pingX = xs[5];
        coordsY = ys[0]; cpsY = ys[1]; armorY = ys[2]; speedY = ys[3]; fpsY = ys[4]; pingY = ys[5];
        hudReferenceWidth = width;
        hudReferenceHeight = height;
    }

    public static void resetHudPositions() {
        ExtraHud.resetPositions();
        hudAnchorX = null;
        hudAnchorY = null;
        coordsX = 8;
        coordsY = 8;
        cpsX = 8;
        cpsY = 40;
        armorX = 8;
        armorY = 62;
        speedX = 8;
        speedY = 134;
        fpsX = 8;
        fpsY = 152;
        pingX = 8;
        pingY = 170;
        LunarClientConfig.save();
    }

    public static void applyFullBright(boolean enable) {
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc != null && mc.options != null) {
                double targetGamma = enable ? 100.0 : 1.0;
                mc.options.gamma().set(targetGamma);

            }
        }
        catch (Exception e) {
            LOGGER.warn("Impossible d'appliquer la valeur de Gamma FullBright dans Minecraft: {}", (Object)e.getMessage());
        }
    }

    public static void applyNightVision(boolean enable) {
        try {
            ClientNightVision.update(enable);
        }
        catch (Exception e) {
            LOGGER.warn("Impossible d'appliquer la Vision Nocturne: {}", (Object)e.getMessage());
        }
    }

    public static void sendActionNotification(String featureName, boolean enabled) {
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc != null && mc.gui != null) {
                String status = enabled ? "\u00a7a[ ACTIV\u00c9 ]" : "\u00a7c[ D\u00c9SACTIV\u00c9 ]";
                mc.gui.hud.setOverlayMessage((Component)Component.literal((String)("\u00a76[Yapapouaiye Client] \u00a7f" + featureName + " " + status)), false);
            }
        }
        catch (Exception exception) {
            // empty catch block
        }
    }

    public static void load() {
        File fileToRead;
        File file = fileToRead = configFile != null && configFile.exists() ? configFile : legacyConfigFile;
        if (fileToRead == null || !fileToRead.exists()) {
            try {
                Minecraft mc = Minecraft.getInstance();
                if (mc != null && mc.options != null) {
                    fullBright = (Double)mc.options.gamma().get() > 1.5;
                }
            }
            catch (Exception mc) {
                // empty catch block
            }
            return;
        }
        try (FileReader reader = new FileReader(fileToRead);){
            Data data = (Data)GSON.fromJson((Reader)reader, Data.class);
            if (data != null) {
                fullBright = data.fullBright;
                nightVision = data.nightVision;
                noFog = data.noFog;
                fpsBoost = data.fpsBoost;
                zoom = data.zoom;
                armorStatus = data.armorStatus;
                if (data.armorHud != null) {
                    armorStatus = data.armorHud;
                }
                armorNumbers = data.armorHudNumbers != null ? data.armorHudNumbers : data.armorNumbers;
                keystrokes = data.keystrokes;
                cpsCounter = data.cpsCounter;
                coordinates = data.coordinates;
                speed = data.speed;
                fps = data.fps;
                ping = data.ping;
                hudReferenceWidth = data.hudReferenceWidth;
                hudReferenceHeight = data.hudReferenceHeight;
                hudAnchorX = data.hudAnchorX;
                hudAnchorY = data.hudAnchorY;
                clientMenu = data.clientMenu != null ? data.clientMenu : new ClientMenuWindow();
                potionTimer = data.potionTimer != null ? data.potionTimer : new ExtraHudSettings();
                saturation = data.saturation != null ? data.saturation : defaultSaturation();
                potionTimer.sanitize();
                saturation.sanitize();
                coordsX = data.coordsX;
                coordsY = data.coordsY;
                cpsX = data.cpsX;
                cpsY = data.cpsY;
                armorX = data.armorX;
                armorY = data.armorY;
                speedX = data.speedX;
                speedY = data.speedY;
                fpsX = data.fpsX;
                fpsY = data.fpsY;
                pingX = data.pingX;
                pingY = data.pingY;
                LunarClientConfig.applyFullBright(fullBright);
                LunarClientConfig.applyNightVision(nightVision);
            }
        }
        catch (Exception e) {
            LOGGER.error("Erreur lors de la lecture du fichier de configuration client: {}", (Object)e.getMessage());
        }
    }

    public static void save() {
        FileWriter writer;
        Data data = new Data();
        data.fullBright = fullBright;
        data.nightVision = nightVision;
        data.noFog = noFog;
        data.fpsBoost = fpsBoost;
        data.zoom = zoom;
        data.armorStatus = armorStatus;
        data.armorHud = armorStatus;
        data.armorNumbers = armorNumbers;
        data.armorHudNumbers = armorNumbers;
        data.keystrokes = keystrokes;
        data.cpsCounter = cpsCounter;
        data.coordinates = coordinates;
        data.speed = speed;
        data.fps = fps;
        data.ping = ping;
        data.hudReferenceWidth = hudReferenceWidth;
        data.hudReferenceHeight = hudReferenceHeight;
        data.hudAnchorX = hudAnchorX;
        data.hudAnchorY = hudAnchorY;
        data.clientMenu = clientMenu;
        data.potionTimer = potionTimer;
        data.saturation = saturation;
        data.coordsX = coordsX;
        data.coordsY = coordsY;
        data.cpsX = cpsX;
        data.cpsY = cpsY;
        data.armorX = armorX;
        data.armorY = armorY;
        data.speedX = speedX;
        data.speedY = speedY;
        data.fpsX = fpsX;
        data.fpsY = fpsY;
        data.pingX = pingX;
        data.pingY = pingY;
        if (configFile != null) {
            try {
                writer = new FileWriter(configFile);
                try {
                    GSON.toJson((Object)data, (Appendable)writer);
                }
                finally {
                    writer.close();
                }
            }
            catch (Exception e) {
                LOGGER.error("Erreur lors de la sauvegarde de yapapouaiye_client.json: {}", (Object)e.getMessage());
            }
        }
        if (legacyConfigFile != null) {
            try {
                writer = new FileWriter(legacyConfigFile);
                try {
                    GSON.toJson((Object)data, (Appendable)writer);
                }
                finally {
                    writer.close();
                }
            }
            catch (Exception exception) {
                // empty catch block
            }
        }
    }

    private static class Data {
        boolean fullBright = true;
        boolean nightVision;
        boolean noFog;
        boolean fpsBoost;
        boolean zoom = true;
        boolean armorStatus = true;
        Boolean armorHud = null;
        boolean armorNumbers = true;
        Boolean armorHudNumbers = null;
        boolean keystrokes = true;
        boolean cpsCounter = true;
        boolean coordinates = true;
        boolean speed = true;
        boolean fps = true;
        boolean ping = true;
        int hudReferenceWidth;
        int hudReferenceHeight;
        int[] hudAnchorX;
        int[] hudAnchorY;
        ClientMenuWindow clientMenu = new ClientMenuWindow();
        ExtraHudSettings potionTimer = new ExtraHudSettings();
        ExtraHudSettings saturation = defaultSaturation();
        int coordsX = 8;
        int coordsY = 8;
        int cpsX = 8;
        int cpsY = 40;
        int armorX = 8;
        int armorY = 62;
        int speedX = 8;
        int speedY = 134;
        int fpsX = 8;
        int fpsY = 152;
        int pingX = 8;
        int pingY = 170;

        private Data() {
        }
    }
}

