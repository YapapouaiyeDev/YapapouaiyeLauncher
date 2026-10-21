/*
 * Decompiled with CFR 0.152.
 */
package fr.yapapouaiye.nexlux.data;

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
    private final String headUrl;

    public PlayerSnapshot(String name, String uuid, int ping, String gamemode, String world, double x, double y, double z, float health, int level, String itemInHand, String ip, String headUrl) {
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
        return this.name;
    }

    public String uuid() {
        return this.uuid;
    }

    public int ping() {
        return this.ping;
    }

    public String gamemode() {
        return this.gamemode;
    }

    public String world() {
        return this.world;
    }

    public double x() {
        return this.x;
    }

    public double y() {
        return this.y;
    }

    public double z() {
        return this.z;
    }

    public float health() {
        return this.health;
    }

    public int level() {
        return this.level;
    }

    public String itemInHand() {
        return this.itemInHand;
    }

    public String ip() {
        return this.ip;
    }

    public String headUrl() {
        return this.headUrl;
    }
}

