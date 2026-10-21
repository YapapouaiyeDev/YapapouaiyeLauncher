/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.gson.Gson
 *  com.google.gson.GsonBuilder
 *  net.neoforged.fml.loading.FMLPaths
 *  org.slf4j.Logger
 *  org.slf4j.LoggerFactory
 */
package fr.yapapouaiye.nexlux;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.attribute.FileAttribute;
import net.neoforged.fml.loading.FMLPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class NexLuxConfig {
    private static final Logger LOGGER = LoggerFactory.getLogger((String)"NexLux");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static Path configFile;
    private static ConfigData data;
    private static final String DEFAULT_AVATAR_URL = "https://mc-heads.net/avatar/{name}/64";

    private NexLuxConfig() {
    }

    public static synchronized void load() {
        try {
            ConfigData loaded;
            configFile = FMLPaths.CONFIGDIR.get().resolve("nexlux.json");
            if (Files.exists(configFile, new LinkOption[0]) && (loaded = (ConfigData)GSON.fromJson(Files.readString(configFile), ConfigData.class)) != null) {
                data = loaded;
            }
            NexLuxConfig.normalize(data);
            NexLuxConfig.save();
            LOGGER.info("Configuration NexLux charg\u00e9e depuis {}", (Object)configFile);
        }
        catch (IOException | RuntimeException e) {
            LOGGER.error("Impossible de charger la configuration NexLux, valeurs par d\u00e9faut utilis\u00e9es.", (Throwable)e);
            data = new ConfigData();
            NexLuxConfig.normalize(data);
        }
    }

    public static synchronized void save() {
        try {
            if (configFile == null) {
                configFile = FMLPaths.CONFIGDIR.get().resolve("nexlux.json");
            }
            if (configFile.getParent() != null) {
                Files.createDirectories(configFile.getParent(), new FileAttribute[0]);
            }
            Files.writeString(configFile, (CharSequence)GSON.toJson((Object)data), new OpenOption[0]);
        }
        catch (IOException e) {
            LOGGER.error("Impossible d'\u00e9crire la configuration NexLux.", (Throwable)e);
        }
    }

    private static void normalize(ConfigData cfg) {
        if (cfg.api == null) {
            cfg.api = new ApiConfig();
        }
        if (cfg.api.host == null || cfg.api.host.isBlank()) {
            cfg.api.host = "0.0.0.0";
        }
        if (cfg.api.port < 1 || cfg.api.port > 65535) {
            cfg.api.port = 8080;
        }
        if (cfg.api.token == null) {
            cfg.api.token = "";
        }
        if (cfg.api.avatarUrl == null) {
            cfg.api.avatarUrl = DEFAULT_AVATAR_URL;
        }
    }

    public static ConfigData get() {
        return data;
    }

    static {
        data = new ConfigData();
    }

    public static final class ConfigData {
        public ApiConfig api = new ApiConfig();
        public boolean showPlayerIp = false;
    }

    public static final class ApiConfig {
        public boolean enabled = true;
        public String host = "0.0.0.0";
        public int port = 8080;
        public String token = "";
        public boolean cors = true;
        public String avatarUrl = "https://mc-heads.net/avatar/{name}/64";
    }
}

