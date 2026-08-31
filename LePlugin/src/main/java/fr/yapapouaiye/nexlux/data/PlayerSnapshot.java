package fr.yapapouaiye.nexlux.data;

/**
 * Instantané immutable d'un joueur connecté, construit sur le thread principal
 * du serveur puis lu librement par les threads de l'API HTTP.
 */
public final class PlayerSnapshot {

    private final String name;
    private final String uuid;
    private final int ping;
    private final String gamemode;
    private final String world;
    private final double x;
    private final double y;
    private final double z;
    private final float health;
    private final int level;
    private final String itemInHand;
    private final String ip;
    /** URL de l'avatar (tête) du joueur, ou {@code null} si désactivé. */
    private final String headUrl;

    public PlayerSnapshot(String name, String uuid, int ping, String gamemode, String world,
                          double x, double y, double z, float health, int level,
                          String itemInHand, String ip, String headUrl) {
        this.name = name;
        this.uuid = uuid;
        this.ping = ping;
        this.gamemode = gamemode;
        this.world = world;
        this.x = x;
        this.y = y;
        this.z = z;
        this.health = health;
        this.level = level;
        this.itemInHand = itemInHand;
        this.ip = ip;
        this.headUrl = headUrl;
    }

    public String name() {
        return name;
    }

    public String uuid() {
        return uuid;
    }

    public int ping() {
        return ping;
    }

    public String gamemode() {
        return gamemode;
    }

    public String world() {
        return world;
    }

    public double x() {
        return x;
    }

    public double y() {
        return y;
    }

    public double z() {
        return z;
    }

    public float health() {
        return health;
    }

    public int level() {
        return level;
    }

    public String itemInHand() {
        return itemInHand;
    }

    public String ip() {
        return ip;
    }

    public String headUrl() {
        return headUrl;
    }
}
