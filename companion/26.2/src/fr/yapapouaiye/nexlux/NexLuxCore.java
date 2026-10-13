/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.SharedConstants
 *  net.minecraft.server.MinecraftServer
 *  net.minecraft.server.level.ServerPlayer
 *  net.neoforged.fml.loading.FMLLoader
 *  org.slf4j.Logger
 *  org.slf4j.LoggerFactory
 */
package fr.yapapouaiye.nexlux;

import fr.yapapouaiye.nexlux.NexLuxConfig;
import fr.yapapouaiye.nexlux.api.ApiServer;
import fr.yapapouaiye.nexlux.data.PlayerSnapshot;
import fr.yapapouaiye.nexlux.data.ServerStatus;
import fr.yapapouaiye.nexlux.util.TpsTracker;
import java.util.ArrayList;
import net.minecraft.SharedConstants;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.fml.loading.FMLLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class NexLuxCore {
    private static final Logger LOGGER = LoggerFactory.getLogger((String)"NexLux");
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

    public void onServerStarted(MinecraftServer server) {
        this.server = server;
        this.startTimeMillis = System.currentTimeMillis();
        this.tpsTracker.reset();
        this.refresh();
        this.apiServer.start();
        LOGGER.info("NexLux pr\u00eat. {} joueur(s) en ligne, {} max.", (Object)(this.status != null ? this.status.onlinePlayers() : 0), (Object)(this.status != null ? this.status.maxPlayers() : 0));
    }

    public void onServerStopped() {
        this.apiServer.stop();
        this.server = null;
        this.status = null;
    }

    public void onTick(MinecraftServer server) {
        this.tpsTracker.onTick();
        if (server.getTickCount() % 20 == 0) {
            this.refresh();
        }
    }

    public void onPlayersChanged() {
        this.refresh();
    }

    public synchronized void reload() {
        NexLuxConfig.load();
        this.apiServer.restart();
        this.refresh();
        LOGGER.info("NexLux recharg\u00e9 (API {} sur {}:{})", new Object[]{this.apiServer.isRunning() ? "active" : "d\u00e9sactiv\u00e9e", NexLuxConfig.get().api.host, NexLuxConfig.get().api.port});
    }

    private void refresh() {
        MinecraftServer s = this.server;
        if (s == null) {
            return;
        }
        try {
            ArrayList<PlayerSnapshot> players = new ArrayList<PlayerSnapshot>();
            for (ServerPlayer p : s.getPlayerList().getPlayers()) {
                players.add(this.buildPlayer(p));
            }
            this.status = new ServerStatus(s.getMotd(), SharedConstants.getCurrentVersion().name(), net.neoforged.fml.ModList.get().getModContainerById("neoforge").orElseThrow().getModInfo().getVersion().toString(), SharedConstants.getProtocolVersion(), s.usesAuthentication(), s.getPlayerList().isUsingWhitelist(), s.getWorldData().getDifficulty().name(), s.getMaxPlayers(), (System.currentTimeMillis() - this.startTimeMillis) / 1000L, s.getTickCount(), players, this.tpsTracker.tps1m(), this.tpsTracker.tps5m(), this.tpsTracker.tps15m(), this.tpsTracker.mspt());
        }
        catch (RuntimeException e) {
            LOGGER.warn("Erreur pendant la construction du snapshot NexLux.", (Throwable)e);
        }
    }

    private PlayerSnapshot buildPlayer(ServerPlayer p) {
        String item = p.getMainHandItem().isEmpty() ? null : p.getMainHandItem().getHoverName().getString();
        String ip = NexLuxConfig.get().showPlayerIp ? p.getIpAddress() : null;
        return new PlayerSnapshot(p.getGameProfile().name(), p.getUUID().toString(), p.connection.latency(), p.gameMode.getGameModeForPlayer().getName(), p.level().dimension().identifier().toString(), p.getX(), p.getY(), p.getZ(), p.getHealth(), p.experienceLevel, item, ip, this.buildAvatarUrl(p));
    }

    private String buildAvatarUrl(ServerPlayer p) {
        String tpl = NexLuxConfig.get().api.avatarUrl;
        if (tpl == null || tpl.isBlank()) {
            return null;
        }
        return tpl.replace("{name}", p.getGameProfile().name()).replace("{uuid}", p.getUUID().toString());
    }

    public ServerStatus getStatus() {
        return this.status;
    }

    public MinecraftServer getServer() {
        return this.server;
    }

    public boolean isApiRunning() {
        return this.apiServer.isRunning();
    }
}

