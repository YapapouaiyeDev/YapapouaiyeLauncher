package fr.yapapouaiye.nexlux;

import fr.yapapouaiye.nexlux.api.ApiServer;
import fr.yapapouaiye.nexlux.data.PlayerSnapshot;
import fr.yapapouaiye.nexlux.data.ServerStatus;
import fr.yapapouaiye.nexlux.util.TpsTracker;
import net.minecraft.SharedConstants;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.fml.loading.FMLLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * Cœur de NexLux : possède les références serveur, construit les snapshots
 * (toujours sur le thread principal) et pilote le serveur HTTP.
 */
public final class NexLuxCore {

    private static final Logger LOGGER = LoggerFactory.getLogger("NexLux");

    private static NexLuxCore instance;

    private final TpsTracker tpsTracker = new TpsTracker();
    private final ApiServer apiServer = new ApiServer(this);

    private volatile MinecraftServer server;
    private volatile ServerStatus status;
    private long startTimeMillis;

    private NexLuxCore() {
    }

    public static synchronized void init() {
        if (instance == null) {
            instance = new NexLuxCore();
        }
    }

    public static NexLuxCore get() {
        return instance;
    }

    // ------------------------------------------------------------------
    // Cycle de vie (appelé depuis les événements, thread principal)
    // ------------------------------------------------------------------

    public void onServerStarted(MinecraftServer server) {
        this.server = server;
        this.startTimeMillis = System.currentTimeMillis();
        this.tpsTracker.reset();
        refresh();
        this.apiServer.start();
        LOGGER.info("NexLux prêt. {} joueur(s) en ligne, {} max.", status != null ? status.onlinePlayers() : 0,
                status != null ? status.maxPlayers() : 0);
    }

    public void onServerStopped() {
        this.apiServer.stop();
        this.server = null;
        this.status = null;
    }

    /** Appelé à chaque tick serveur (thread principal). */
    public void onTick(MinecraftServer server) {
        tpsTracker.onTick();
        // Rafraîchit le snapshot une fois par seconde (20 ticks).
        if (server.getTickCount() % 20 == 0) {
            refresh();
        }
    }

    /** Appelé à chaque connexion / déconnexion d'un joueur. */
    public void onPlayersChanged() {
        refresh();
    }

    /** Recharge la configuration et redémarre l'API si nécessaire. */
    public synchronized void reload() {
        NexLuxConfig.load();
        apiServer.restart();
        refresh();
        LOGGER.info("NexLux rechargé (API {} sur {}:{})", apiServer.isRunning() ? "active" : "désactivée",
                NexLuxConfig.get().api.host, NexLuxConfig.get().api.port);
    }

    // ------------------------------------------------------------------
    // Snapshots (thread principal uniquement)
    // ------------------------------------------------------------------

    private void refresh() {
        MinecraftServer s = server;
        if (s == null) {
            return;
        }
        try {
            List<PlayerSnapshot> players = new ArrayList<>();
            for (ServerPlayer p : s.getPlayerList().getPlayers()) {
                players.add(buildPlayer(p));
            }
            status = new ServerStatus(
                    s.getMotd(),
                    SharedConstants.getCurrentVersion().getName(),
                    FMLLoader.versionInfo().neoForgeVersion(),
                    SharedConstants.getProtocolVersion(),
                    s.usesAuthentication(),
                    s.getPlayerList().isUsingWhitelist(),
                    s.getWorldData().getDifficulty().name(),
                    s.getMaxPlayers(),
                    (System.currentTimeMillis() - startTimeMillis) / 1000L,
                    s.getTickCount(),
                    players,
                    tpsTracker.tps1m(),
                    tpsTracker.tps5m(),
                    tpsTracker.tps15m(),
                    tpsTracker.mspt()
            );
        } catch (RuntimeException e) {
            LOGGER.warn("Erreur pendant la construction du snapshot NexLux.", e);
        }
    }

    private PlayerSnapshot buildPlayer(ServerPlayer p) {
        String item = p.getMainHandItem().isEmpty() ? null : p.getMainHandItem().getHoverName().getString();
        String ip = NexLuxConfig.get().showPlayerIp ? p.getIpAddress() : null;
        return new PlayerSnapshot(
                p.getGameProfile().getName(),
                p.getUUID().toString(),
                p.connection.latency(),
                p.gameMode.getGameModeForPlayer().getName(),
                p.level().dimension().location().toString(),
                p.getX(),
                p.getY(),
                p.getZ(),
                p.getHealth(),
                p.experienceLevel,
                item,
                ip,
                buildAvatarUrl(p)
        );
    }

    /** Construit l'URL d'avatar (tête) du joueur selon le modèle configuré. */
    private String buildAvatarUrl(ServerPlayer p) {
        String tpl = NexLuxConfig.get().api.avatarUrl;
        if (tpl == null || tpl.isBlank()) {
            return null;
        }
        return tpl.replace("{name}", p.getGameProfile().getName())
                .replace("{uuid}", p.getUUID().toString());
    }

    /** Dernier snapshot construit (peut être {@code null} si le serveur n'est pas démarré). */
    public ServerStatus getStatus() {
        return status;
    }

    public MinecraftServer getServer() {
        return server;
    }

    /** Indique si le serveur HTTP de l'API est actuellement actif. */
    public boolean isApiRunning() {
        return apiServer.isRunning();
    }
}
