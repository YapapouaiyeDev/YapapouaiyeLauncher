package fr.yapapouaiye.nexlux.standby;

import com.google.gson.JsonParser;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import net.minecraft.client.Minecraft;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.common.ServerboundCustomPayloadPacket;

/** Authenticates only to the launcher's loopback proxy, never a remote server. */
public final class RelayClient {
    private static String secret;
    private static int port;
    private static boolean loaded, available;
    private RelayClient() {}
    private static void load() {
        if (loaded) return;
        loaded = true;
        try {
            String file = System.getProperty("nexlux.relayControl");
            if (file == null) return;
            Path path = Path.of(file);
            if (Files.size(path) > 4096) return;
            var data = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
            String value = data.get("secret").getAsString();
            int valuePort = data.get("port").getAsInt();
            if (value.matches("[a-f0-9]{64}") && valuePort > 0 && valuePort <= 65535) { secret = value; port = valuePort; }
        } catch (Exception ignored) {}
    }
    public static boolean isLocal(Connection connection) {
        load();
        return secret != null && connection.getRemoteAddress() instanceof InetSocketAddress address
            && address.getAddress() != null && address.getAddress().isLoopbackAddress() && address.getPort() == port;
    }
    public static byte[] proof(Connection connection, String challenge) {
        if (!isLocal(connection) || !challenge.matches("nexlux:relay_auth/[a-f0-9]{32}")) return null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.US_ASCII), "HmacSHA256"));
            return mac.doFinal(challenge.getBytes(StandardCharsets.US_ASCII));
        } catch (Exception ignored) { return null; }
    }
    public static boolean available() { return available && Minecraft.getInstance().getConnection() != null; }
    public static void receive(RelayPayload message) {
        if (StandbyNetworkClient.receive(message)) return;
        var client = Minecraft.getInstance();
        var listener = client.getConnection();
        if (listener == null || !isLocal(listener.getConnection())) return;
        if (message.operation() == RelayPayload.CAPABILITIES) available = true;
        else if (message.operation() == RelayPayload.EXIT) {
            StandbyClient.enter();
            client.stop(); // graceful Minecraft shutdown, never force-kill Java
        } else if (message.operation() == RelayPayload.FOCUS) {
            StandbyClient.resume();
            StandbyPlatform.setScreen(null);
            StandbyPlatform.focus();
        }
    }
    public static void disconnected(Connection connection) {
        StandbyNetworkClient.reset();
        // Keep Minecraft's disconnect screen and its explanation visible.
        // Only an authenticated EXIT command requests a graceful shutdown.
        if (isLocal(connection)) available = false;
    }
    public static void detach() {
        var listener = Minecraft.getInstance().getConnection();
        if (available() && isLocal(listener.getConnection())) listener.getConnection().send(new ServerboundCustomPayloadPacket(new RelayPayload(RelayPayload.DETACH, UUID.randomUUID())));
    }
}
