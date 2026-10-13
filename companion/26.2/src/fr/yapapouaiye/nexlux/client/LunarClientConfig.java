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
        return coordsX;
    }

    public static void setCoordsX(int x) {
        coordsX = x;
    }

    public static int getCoordsY() {
        return coordsY;
    }

    public static void setCoordsY(int y) {
        coordsY = y;
    }

    public static void setCoordsPos(int x, int y) {
        coordsX = x;
        coordsY = y;
        LunarClientConfig.save();
    }

    public static int getCpsX() {
        return cpsX;
    }

    public static void setCpsX(int x) {
        cpsX = x;
    }

    public static int getCpsY() {
        return cpsY;
    }

    public static void setCpsY(int y) {
        cpsY = y;
    }

    public static void setCpsPos(int x, int y) {
        cpsX = x;
        cpsY = y;
        LunarClientConfig.save();
    }

    public static int getArmorX() {
        return armorX;
    }

    public static void setArmorX(int x) {
        armorX = x;
    }

    public static int getArmorY() {
        return armorY;
    }

    public static void setArmorY(int y) {
        armorY = y;
    }

    public static void setArmorPos(int x, int y) {
        armorX = x;
        armorY = y;
        LunarClientConfig.save();
    }

    public static int getSpeedX() {
        return speedX;
    }

    public static void setSpeedX(int x) {
        speedX = x;
    }

    public static int getSpeedY() {
        return speedY;
    }

    public static void setSpeedY(int y) {
        speedY = y;
    }

    public static void setSpeedPos(int x, int y) {
        speedX = x;
        speedY = y;
        LunarClientConfig.save();
    }

    public static int getFpsX() {
        return fpsX;
    }

    public static void setFpsX(int x) {
        fpsX = x;
    }

    public static int getFpsY() {
        return fpsY;
    }

    public static void setFpsY(int y) {
        fpsY = y;
    }

    public static void setFpsPos(int x, int y) {
        fpsX = x;
        fpsY = y;
        LunarClientConfig.save();
    }

    public static int getPingX() {
        return pingX;
    }

    public static void setPingX(int x) {
        pingX = x;
    }

    public static int getPingY() {
        return pingY;
    }

    public static void setPingY(int y) {
        pingY = y;
    }

    public static void setPingPos(int x, int y) {
        pingX = x;
        pingY = y;
        LunarClientConfig.save();
    }

    public static void resetHudPositions() {
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
            Minecraft mc = Minecraft.getInstance();
            if (mc != null && mc.player != null) {
                if (enable) {
                    mc.player.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, 999999, 0, false, false, false));
                } else if (mc.player.hasEffect(MobEffects.NIGHT_VISION)) {
                    mc.player.removeEffect(MobEffects.NIGHT_VISION);
                }
            }
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

