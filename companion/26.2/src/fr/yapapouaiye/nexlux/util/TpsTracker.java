/*
 * Decompiled with CFR 0.152.
 */
package fr.yapapouaiye.nexlux.util;

import java.util.Arrays;

public final class TpsTracker {
    private static final int HISTORY_SECONDS = 900;
    private static final long NANOS_PER_SECOND = 1000000000L;
    private final long[] ticksPerSecond = new long[900];
    private int index;
    private long lastTickNanos;
    private long secondStartNanos;
    private long ticksThisSecond;
    private volatile double tps1m;
    private volatile double tps5m;
    private volatile double tps15m;
    private volatile double mspt;

    public synchronized void onTick() {
        long elapsed;
        long now = System.nanoTime();
        if (this.lastTickNanos != 0L) {
            this.mspt = (double)(now - this.lastTickNanos) / 1000000.0;
        }
        this.lastTickNanos = now;
        if (this.secondStartNanos == 0L) {
            this.secondStartNanos = now;
        }
        if ((elapsed = now - this.secondStartNanos) >= 1000000000L) {
            long seconds = Math.max(1L, elapsed / 1000000000L);
            long perSecond = seconds == 1L ? this.ticksThisSecond : this.ticksThisSecond / seconds;
            for (long s = 0L; s < seconds; ++s) {
                this.ticksPerSecond[this.index] = perSecond;
                this.index = (this.index + 1) % 900;
            }
            this.secondStartNanos += seconds * 1000000000L;
            this.ticksThisSecond = 0L;
        }
        ++this.ticksThisSecond;
        if (now % 20L == 0L) {
            this.tps1m = this.averageTps(60);
            this.tps5m = this.averageTps(300);
            this.tps15m = this.averageTps(900);
        }
    }

    public synchronized void reset() {
        Arrays.fill(this.ticksPerSecond, 0L);
        this.index = 0;
        this.lastTickNanos = 0L;
        this.secondStartNanos = 0L;
        this.ticksThisSecond = 0L;
        this.tps1m = 20.0;
        this.tps5m = 20.0;
        this.tps15m = 20.0;
        this.mspt = 0.0;
    }

    private double averageTps(int windowSeconds) {
        int idx;
        long v;
        int window = Math.min(windowSeconds, 900);
        long sum = 0L;
        int count = 0;
        for (int i = 0; i < window && (v = this.ticksPerSecond[idx = (this.index - 1 - i + 1800) % 900]) > 0L; ++i) {
            sum += v;
            ++count;
        }
        if (count == 0) {
            return 20.0;
        }
        return Math.min(20.0, (double)sum / (double)count);
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

