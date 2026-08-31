package fr.yapapouaiye.nexlux;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.neoforged.fml.loading.FMLPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Configuration persistante du mod, stockée dans {@code config/nexlux.json}.
 * <p>
 * Le fichier est créé automatiquement avec les valeurs par défaut au premier
 * démarrage, et relu à chaque commande {@code /nexlux reload}.
 */
public final class NexLuxConfig {

    private static final Logger LOGGER = LoggerFactory.getLogger("NexLux");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static Path configFile;
    private static ConfigData data = new ConfigData();

    private NexLuxConfig() {
    }

    /** Charge la configuration depuis le disque (ou crée les défauts si absente). */
    public static synchronized void load() {
        try {
            configFile = FMLPaths.CONFIGDIR.get().resolve("nexlux.json");
            if (Files.exists(configFile)) {
                ConfigData loaded = GSON.fromJson(Files.readString(configFile), ConfigData.class);
                if (loaded != null) {
                    data = loaded;
                }
            }
            normalize(data);
            save();
            LOGGER.info("Configuration NexLux chargée depuis {}", configFile);
        } catch (IOException | RuntimeException e) {
            LOGGER.error("Impossible de charger la configuration NexLux, valeurs par défaut utilisées.", e);
            data = new ConfigData();
            normalize(data);
        }
    }

    /** Écrit la configuration courante sur le disque. */
    public static synchronized void save() {
        try {
            if (configFile == null) {
                configFile = FMLPaths.CONFIGDIR.get().resolve("nexlux.json");
            }
            if (configFile.getParent() != null) {
                Files.createDirectories(configFile.getParent());
            }
            Files.writeString(configFile, GSON.toJson(data));
        } catch (IOException e) {
            LOGGER.error("Impossible d'écrire la configuration NexLux.", e);
        }
    }

    /** Replie les champs manquants sur leurs valeurs par défaut. */
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

    /** Structure racine du fichier {@code nexlux.json}. */
    public static final class ConfigData {
        public ApiConfig api = new ApiConfig();
        /** Inclure l'adresse IP de chaque joueur dans l'API. Désactivé par défaut (confidentialité). */
        public boolean showPlayerIp = false;
    }

    private static final String DEFAULT_AVATAR_URL = "https://mc-heads.net/avatar/{name}/64";

    /** Réglages de l'API HTTP. */
    public static final class ApiConfig {
        /** Active ou désactive complètement le serveur HTTP. */
        public boolean enabled = true;
        /** Interface d'écoute : 0.0.0.0 pour exposer à l'extérieur, 127.0.0.1 pour local uniquement. */
        public String host = "0.0.0.0";
        /** Port d'écoute de l'API (par défaut 8080). */
        public int port = 8080;
        /**
         * Jeton d'authentification optionnel. Si renseigné, toutes les requêtes
         * doivent porter {@code Authorization: Bearer <jeton>} ou {@code ?token=<jeton>}.
         */
        public String token = "";
        /** Ajoute l'en-tête CORS {@code Access-Control-Allow-Origin: *} (utile pour un site web). */
        public boolean cors = true;
        /**
         * Modèle d'URL des avatars (têtes) de joueurs. Placeholders disponibles :
         * {@code {name}} (pseudo) et {@code {uuid}}. Laisser vide pour ne pas
         * exposer d'avatars. Défaut : mc-heads.net (recherche par pseudo).
         */
        public String avatarUrl = DEFAULT_AVATAR_URL;
    }
}
