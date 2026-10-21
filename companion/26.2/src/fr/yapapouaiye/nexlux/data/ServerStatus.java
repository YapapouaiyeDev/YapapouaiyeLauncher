/*
 * Decompiled with CFR 0.152.
 */
package fr.yapapouaiye.nexlux.data;

import fr.yapapouaiye.nexlux.data.PlayerSnapshot;
import java.util.List;

public final class ServerStatus {
    private final String motd;
    private final String version;
    private final String neoforgeVersion;
    private final int protocol;
    private final boolean onlineMode;
    private final boolean whitelist;
    private final String difficulty;
    private final int maxPlayers;
    private final long uptimeSeconds;
    private final int tick;
    private final List<PlayerSnapshot> players;
    private final double tps1m;
    private final double tps5m;
    private final double tps15m;
    private final double mspt;

    public ServerStatus(String motd, String version, String neoforgeVersion, int protocol, boolean onlineMode, boolean whitelist, String difficulty, int maxPlayers, long uptimeSeconds, int tick, List<PlayerSnapshot> players, double tps1m, double tps5m, double tps15m, double mspt) {
        this.motd = motd;
        this.version = version;
        this.neoforgeVersion = neoforgeVersion;
        this.protocol = protocol;
        this.onlineMode = onlineMode;
        this.whitelist = whitelist;
        this.difficulty = difficulty;
        this.maxPlayers = maxPlayers;
        this.uptimeSeconds = uptimeSeconds;
        this.tick = tick;
        this.players = List.copyOf(players);
        this.tps1m = tps1m;
        this.tps5m = tps5m;
        this.tps15m = tps15m;
        this.mspt = mspt;
    }

    public String motd() {
        return this.motd;
    }

    public String version() {
        return this.version;
    }

    public String neoforgeVersion() {
        return this.neoforgeVersion;
    }

    public int protocol() {
        return this.protocol;
    }

    public boolean onlineMode() {
        return this.onlineMode;
    }

    public boolean whitelist() {
        return this.whitelist;
    }

    public String difficulty() {
        return this.difficulty;
    }

    public int maxPlayers() {
        return this.maxPlayers;
    }

    public long uptimeSeconds() {
        return this.uptimeSeconds;
    }

    public int tick() {
        return this.tick;
    }

    public List<PlayerSnapshot> players() {
        return this.players;
    }

    public int onlinePlayers() {
        return this.players.size();
    }

    public double tps1m() {
        return this.tps1m;
    }

    public double tps5m() {
        return this.tps5m;
    }

    public double tps15m() {
        return this.tps15m;
    }

    public double mspt() {
        return this.mspt;
    }
}

