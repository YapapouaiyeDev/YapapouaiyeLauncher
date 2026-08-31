package fr.yapapouaiye.nexlux.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.nio.file.Path;

/**
 * Configuration et gestion de l'état des options Lunar Client en jeu (Night Vision, NoFog, etc.).
 */
public final class LunarClientConfig {

    private static final Logger LOGGER = LoggerFactory.getLogger("LunarClient");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static boolean nightVision = false;
    private static boolean noFog = false;
    private static boolean fpsBoost = false;

    private static File configFile;

    private LunarClientConfig() {
    }

    public static void init(Path gameDirPath) {
        File configDir = gameDirPath.resolve("config").toFile();
        if (!configDir.exists()) {
            configDir.mkdirs();
        }
        configFile = new File(configDir, "lunar_client.json");
        load();
    }

    public static boolean isNightVision() {
        return nightVision;
    }

    public static void setNightVision(boolean enable, boolean notifyPlayer) {
        nightVision = enable;
        applyNightVision(enable);
        save();
        if (notifyPlayer) {
            sendActionNotification("Night Vision (FullBright)", enable);
        }
    }

    public static boolean isNoFog() {
        return noFog;
    }

    public static void setNoFog(boolean enable, boolean notifyPlayer) {
        noFog = enable;
        save();
        if (notifyPlayer) {
            sendActionNotification("NoFog (Anti-Brouillard)", enable);
        }
    }

    public static boolean isFpsBoost() {
        return fpsBoost;
    }

    public static void setFpsBoost(boolean enable, boolean notifyPlayer) {
        fpsBoost = enable;
        save();
        if (enable) {
            System.gc();
        }
        if (notifyPlayer) {
            sendActionNotification("FPS Boost & GC Flush", enable);
        }
    }

    public static void applyNightVision(boolean enable) {
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc != null) {
                if (mc.options != null) {
                    double targetGamma = enable ? 100.0 : 1.0;
                    mc.options.gamma().set(targetGamma);
                    mc.options.save();
                }
                if (!enable && mc.player != null && mc.player.hasEffect(net.minecraft.world.effect.MobEffects.NIGHT_VISION)) {
                    mc.player.removeEffect(net.minecraft.world.effect.MobEffects.NIGHT_VISION);
                }
            }
        } catch (Exception e) {
            LOGGER.warn("Impossible d'appliquer la valeur de Gamma dans Minecraft: {}", e.getMessage());
        }
    }

    public static void sendActionNotification(String featureName, boolean enabled) {
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc != null && mc.gui != null) {
                String status = enabled ? "§a[ ACTIVÉ ]" : "§c[ DÉSACTIVÉ ]";
                mc.gui.setOverlayMessage(Component.literal("§b[Lunar Client] §f" + featureName + " " + status), false);
            }
        } catch (Exception ignored) {
        }
    }

    public static void load() {
        if (configFile == null || !configFile.exists()) {
            // Détection initiale du Gamma depuis options.txt de Minecraft
            try {
                Minecraft mc = Minecraft.getInstance();
                if (mc != null && mc.options != null) {
                    nightVision = mc.options.gamma().get() > 1.5;
                }
            } catch (Exception ignored) {
            }
            return;
        }

        try (FileReader reader = new FileReader(configFile)) {
            Data data = GSON.fromJson(reader, Data.class);
            if (data != null) {
                nightVision = data.nightVision;
                noFog = data.noFog;
                fpsBoost = data.fpsBoost;
                applyNightVision(nightVision);
            }
        } catch (Exception e) {
            LOGGER.error("Erreur lors de la lecture de lunar_client.json: {}", e.getMessage());
        }
    }

    public static void save() {
        if (configFile == null) {
            return;
        }

        try (FileWriter writer = new FileWriter(configFile)) {
            Data data = new Data();
            data.nightVision = nightVision;
            data.noFog = noFog;
            data.fpsBoost = fpsBoost;
            GSON.toJson(data, writer);
        } catch (Exception e) {
            LOGGER.error("Erreur lors de la sauvegarde de lunar_client.json: {}", e.getMessage());
        }
    }

    private static class Data {
        boolean nightVision;
        boolean noFog;
        boolean fpsBoost;
    }
}
