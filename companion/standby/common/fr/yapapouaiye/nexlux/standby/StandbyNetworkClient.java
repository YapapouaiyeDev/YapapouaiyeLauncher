package fr.yapapouaiye.nexlux.standby;

import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.common.ServerboundCustomPayloadPacket;
import net.neoforged.neoforge.network.registration.NetworkRegistry;

/** Main-thread state machine; the TCP connection and its keepalive handler live on. */
public final class StandbyNetworkClient {
    private enum State { OFF, PROBING, ENTERING, FROZEN, WAKING }
    private static State state = State.OFF;
    private static Connection connection;
    private static boolean unsupported;
    private static int probeTicks;
    private StandbyNetworkClient() {}
    public static boolean frozen() { return state == State.FROZEN || state == State.WAKING; }
    public static void enter() {
        if (state != State.OFF) return;
        unsupported = false;
        var listener = Minecraft.getInstance().getConnection();
        if (listener == null || !NetworkRegistry.hasChannel(listener, RelayPayload.TYPE.id())) { unsupported = true; return; }
        connection = listener.getConnection();
        state = State.PROBING;
        probeTicks = 100;
        send(RelayPayload.HELLO, StandbyProtocol.PROBE);
    }
    public static void resume() {
        if (state == State.ENTERING || state == State.FROZEN) {
            state = State.WAKING;
            send(RelayPayload.RESYNC, StandbyProtocol.WAKE);
        } else if (state == State.PROBING) reset();
    }
    private static void send(int operation, UUID request) {
        if (connection != null) connection.send(new ServerboundCustomPayloadPacket(new RelayPayload(operation, request)));
    }
    public static String status() {
        if (frozen()) return state == State.WAKING ? "Reprise : synchronisation du monde…" : "Monde figé · Flux du monde suspendu";
        if (state != State.OFF) return "Activation de la veille réseau…";
        return unsupported ? "Serveur non compatible : veille graphique seule" : "Rendu du monde coupé · Son en pause";
    }
    public static void tick() {
        if (state == State.PROBING && --probeTicks <= 0) { reset(); unsupported = true; }
        var listener = Minecraft.getInstance().getConnection();
        if (connection != null && (listener == null || listener.getConnection() != connection)) reset();
    }
    public static void reset() { state = State.OFF; connection = null; unsupported = false; probeTicks = 0; }
    public static boolean receive(RelayPayload message) {
        if (!StandbyProtocol.owns(message.request())) return false;
        var listener = Minecraft.getInstance().getConnection();
        if (connection == null || listener == null || listener.getConnection() != connection) return true;
        if (message.request().equals(StandbyProtocol.PROBE)) {
            if (state == State.PROBING && message.operation() == RelayPayload.BACKGROUND) {
                state = State.ENTERING;
                send(RelayPayload.BACKGROUND, StandbyProtocol.ENTER);
            } else if (message.operation() == RelayPayload.CAPABILITIES) { reset(); unsupported = true; }
        } else if (message.request().equals(StandbyProtocol.ENTER)) {
            if (message.operation() == RelayPayload.ERROR) { reset(); unsupported = true; }
            else if (state == State.ENTERING && message.operation() == RelayPayload.BACKGROUND) {
                state = State.FROZEN;
                var mc = Minecraft.getInstance();
                // Retain a small cache only. The server reconstructs the world on wake.
                if (mc.level != null) mc.level.getChunkSource().updateViewRadius(2);
                ((fr.yapapouaiye.nexlux.standby.mixin.StandbyParticlesMixin)mc.particleEngine).nexlux$clearParticles();
                StandbyClient.scheduleMemoryCleanup();
            }
        } else if (message.request().equals(StandbyProtocol.WAKE) && message.operation() == RelayPayload.END) {
            reset();
        }
        return true;
    }
}
