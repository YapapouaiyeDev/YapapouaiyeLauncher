package fr.yapapouaiye.nexlux.util;

/**
 * Mesure le TPS du serveur à partir des ticks réels, seconde par seconde.
 * <p>
 * Mis à jour sur le thread principal (à chaque tick), lu par les threads HTTP
 * via des champs volatils. On conserve 15 minutes d'historique pour calculer
 * des moyennes sur 1/5/15 minutes.
 */
public final class TpsTracker {

    private static final int HISTORY_SECONDS = 900;
    private static final long NANOS_PER_SECOND = 1_000_000_000L;

    private final long[] ticksPerSecond = new long[HISTORY_SECONDS];
    private int index;
    private long lastTickNanos;
    private long secondStartNanos;
    private long ticksThisSecond;

    private volatile double tps1m;
    private volatile double tps5m;
    private volatile double tps15m;
    private volatile double mspt;

    /** À appeler à chaque {@code ServerTickEvent.Post} (thread principal). */
    public synchronized void onTick() {
        long now = System.nanoTime();

        if (lastTickNanos != 0L) {
            mspt = (now - lastTickNanos) / 1_000_000.0;
        }
        lastTickNanos = now;

        if (secondStartNanos == 0L) {
            secondStartNanos = now;
        }

        long elapsed = now - secondStartNanos;
        if (elapsed >= NANOS_PER_SECOND) {
            long seconds = Math.max(1L, elapsed / NANOS_PER_SECOND);
            long perSecond = seconds == 1L ? ticksThisSecond : ticksThisSecond / seconds;
            for (long s = 0; s < seconds; s++) {
                ticksPerSecond[index] = perSecond;
                index = (index + 1) % HISTORY_SECONDS;
            }
            secondStartNanos += seconds * NANOS_PER_SECOND;
            ticksThisSecond = 0;
        }

        ticksThisSecond++;

        if (now % 20 == 0) { // approximatif : ~une fois par seconde, on recalcule les moyennes
            tps1m = averageTps(60);
            tps5m = averageTps(300);
            tps15m = averageTps(900);
        }
    }

    /** Réinitialise l'historique (appelé au démarrage du serveur). */
    public synchronized void reset() {
        java.util.Arrays.fill(ticksPerSecond, 0L);
        index = 0;
        lastTickNanos = 0L;
        secondStartNanos = 0L;
        ticksThisSecond = 0L;
        tps1m = 20.0;
        tps5m = 20.0;
        tps15m = 20.0;
        mspt = 0.0;
    }

    private double averageTps(int windowSeconds) {
        int window = Math.min(windowSeconds, HISTORY_SECONDS);
        long sum = 0;
        int count = 0;
        for (int i = 0; i < window; i++) {
            int idx = (index - 1 - i + HISTORY_SECONDS * 2) % HISTORY_SECONDS;
            long v = ticksPerSecond[idx];
            if (v <= 0) {
                break; // historique pas encore rempli
            }
            sum += v;
            count++;
        }
        if (count == 0) {
            return 20.0;
        }
        return Math.min(20.0, (double) sum / count);
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

    /** Temps moyen par tick (millisecondes). */
    public double mspt() {
        return mspt;
    }
}
