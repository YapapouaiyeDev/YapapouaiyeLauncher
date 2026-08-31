package fr.yapapouaiye.nexlux.data;

import java.util.List;

/**
 * Instantané immutable de l'état du serveur, construit sur le thread principal
 * (une fois par seconde et à chaque connexion/déconnexion) puis lu par l'API HTTP.
 */
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

    public ServerStatus(String motd, String version, String neoforgeVersion, int protocol,
                        boolean onlineMode, boolean whitelist, String difficulty,
                        int maxPlayers, long uptimeSeconds, int tick,
                        List<PlayerSnapshot> players, double tps1m, double tps5m, double tps15m, double mspt) {
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
        return motd;
    }

    public String version() {
        return version;
    }

    public String neoforgeVersion() {
        return neoforgeVersion;
    }

    public int protocol() {
        return protocol;
    }

    public boolean onlineMode() {
        return onlineMode;
    }

    public boolean whitelist() {
        return whitelist;
    }

    public String difficulty() {
        return difficulty;
    }

    public int maxPlayers() {
        return maxPlayers;
    }

    public long uptimeSeconds() {
        return uptimeSeconds;
    }

    public int tick() {
        return tick;
    }

    public List<PlayerSnapshot> players() {
        return players;
    }

    public int onlinePlayers() {
        return players.size();
    }

    public double tps1m() {
        return tps1m;
    }

    public double tps5m() {
        return tps5m;
    }

    public double tps15m() {
        return tps15m;
    }

    public double mspt() {
        return mspt;
    }
}
