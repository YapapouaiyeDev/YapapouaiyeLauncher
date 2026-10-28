/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.GZIPOutputStream;
import static org.junit.Assert.*;

public class MinecraftServersTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private Path game() throws IOException { return temporary.newFolder().toPath(); }
    private LauncherApi.Server server(String id, String name, String host, int port) {
        LauncherApi.Server server = new LauncherApi.Server();
        server.id = id; server.name = name; server.host = host; server.gamePort = port;
        server.gameVersion = "1.21.1"; server.defaultLoader = "fabric";
        return server;
    }
    private void text(DataOutputStream out, String key, String value) throws IOException {
        out.writeByte(8); out.writeUTF(key); out.writeUTF(value);
    }
    /** Hand-written fixture matches Java Edition's uncompressed, named root compound and compound list. */
    private byte[] fixture(String name, String ip, boolean metadata) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeByte(10); out.writeUTF("");
            if (metadata) {
                out.writeByte(10); out.writeUTF("otherRootData");
                out.writeByte(2); out.writeUTF("short"); out.writeShort(42);
                out.writeByte(3); out.writeUTF("int"); out.writeInt(123456);
                out.writeByte(4); out.writeUTF("long"); out.writeLong(123456789012L);
                out.writeByte(5); out.writeUTF("float"); out.writeFloat(1.25f);
                out.writeByte(6); out.writeUTF("double"); out.writeDouble(9.5);
                out.writeByte(7); out.writeUTF("bytes"); out.writeInt(3); out.write(new byte[]{1, 2, 3});
                out.writeByte(11); out.writeUTF("ints"); out.writeInt(2); out.writeInt(6); out.writeInt(7);
                out.writeByte(12); out.writeUTF("longs"); out.writeInt(2); out.writeLong(8); out.writeLong(9);
                out.writeByte(9); out.writeUTF("empty"); out.writeByte(0); out.writeInt(0);
                out.writeByte(0);
            }
            out.writeByte(9); out.writeUTF("servers"); out.writeByte(10); out.writeInt(1);
            text(out, "name", name); text(out, "ip", ip);
            if (metadata) {
                text(out, "icon", "data:image/png;base64,AAAA");
                out.writeByte(1); out.writeUTF("acceptTextures"); out.writeByte(0);
                out.writeByte(1); out.writeUTF("hidden"); out.writeByte(1);
                out.writeByte(3); out.writeUTF("resourcePack"); out.writeInt(2);
            }
            out.writeByte(0); out.writeByte(0);
        }
        return bytes.toByteArray();
    }
    private Map<String, Object> read(Path root) throws IOException {
        try (DataInputStream in = new DataInputStream(Files.newInputStream(root.resolve("servers.dat")))) {
            assertEquals("Java Edition expects a TAG_Compound root", 10, in.readUnsignedByte());
            assertEquals("", in.readUTF());
            Map<String, Object> result = readCompound(in);
            assertEquals(-1, in.read()); return result;
        }
    }
    private Map<String, Object> readCompound(DataInputStream in) throws IOException {
        Map<String, Object> values = new LinkedHashMap<>(); int type;
        while ((type = in.readUnsignedByte()) != 0) values.put(in.readUTF(), readPayload(in, type));
        return values;
    }
    private Object readPayload(DataInputStream in, int type) throws IOException {
        switch (type) {
            case 1: return in.readByte();
            case 2: return in.readShort();
            case 3: return in.readInt();
            case 4: return in.readLong();
            case 5: return in.readFloat();
            case 6: return in.readDouble();
            case 7: { byte[] values = new byte[in.readInt()]; in.readFully(values); return values; }
            case 8: return in.readUTF();
            case 9: {
                int child = in.readUnsignedByte(), size = in.readInt(); List<Object> values = new ArrayList<>();
                for (int i = 0; i < size; i++) values.add(readPayload(in, child)); return values;
            }
            case 10: return readCompound(in);
            case 11: { int[] values = new int[in.readInt()]; for (int i = 0; i < values.length; i++) values[i] = in.readInt(); return values; }
            case 12: { long[] values = new long[in.readInt()]; for (int i = 0; i < values.length; i++) values[i] = in.readLong(); return values; }
            default: throw new IOException("Unexpected fixture tag " + type);
        }
    }
    @SuppressWarnings("unchecked") private List<Map<String, Object>> servers(Path root) throws IOException {
        return (List<Map<String, Object>>) read(root).get("servers");
    }
    @Test public void writesAllVersionsWithActualGamePortsAndBracketedIpv6WithoutAccessData() throws Exception {
        Path root = game();
        List<LauncherApi.Server> catalogue = LauncherApi.parseCatalog("{\"ok\":true,\"servers\":[" +
            "{\"id\":\"se\",\"name\":\"AdoServSE\",\"host\":\"example.test\",\"gamePort\":57542,\"pingPort\":1234,\"gameVersion\":\"26.2\",\"defaultLoader\":\"neoforge\",\"codesRequired\":true,\"codesCount\":1,\"code\":\"PRIVATE_ACCESS_CODE\"}," +
            "{\"id\":\"lx\",\"name\":\"AdoServLXVII\",\"host\":\"2001:db8::1\",\"gamePort\":25580,\"gameVersion\":\"1.21.1\",\"defaultLoader\":\"forge\"}]}");
        MinecraftServers.synchronize(root, catalogue);
        List<Map<String, Object>> values = servers(root);
        assertEquals(2, values.size());
        Map<String, String> addresses = new HashMap<>();
        for (Map<String, Object> value : values) addresses.put((String) value.get("name"), (String) value.get("ip"));
        assertEquals("example.test:57542", addresses.get("AdoServSE"));
        assertEquals("[2001:db8::1]:25580", addresses.get("AdoServLXVII"));
        String nbt = new String(Files.readAllBytes(root.resolve("servers.dat")), StandardCharsets.ISO_8859_1);
        String inventory = new String(Files.readAllBytes(root.resolve(".yapapouaiye-managed-servers.json")), StandardCharsets.UTF_8);
        for (String text : Arrays.asList(nbt, inventory)) {
            assertFalse(text.contains("PRIVATE_ACCESS_CODE")); assertFalse(text.contains("codesRequired"));
            assertFalse(text.contains("pingPort")); assertFalse(text.contains("defaultLoader"));
        }
    }
    @Test public void preservesCustomServersAndAllNbtMetadata() throws Exception {
        Path root = game(); byte[] original = fixture("Minecraft Server", "personal.test:25565", true);
        Files.write(root.resolve("servers.dat"), original);
        MinecraftServers.synchronize(root, List.of(server("official", "Yapapouaiye", "official.test", 25570)));
        List<Map<String, Object>> values = servers(root);
        assertEquals(2, values.size()); assertEquals("Minecraft Server", values.get(0).get("name"));
        assertEquals("personal.test:25565", values.get(0).get("ip"));
        assertEquals("data:image/png;base64,AAAA", values.get(0).get("icon"));
        assertEquals((byte) 0, values.get(0).get("acceptTextures")); assertEquals((byte) 1, values.get(0).get("hidden"));
        assertEquals(2, values.get(0).get("resourcePack"));
        @SuppressWarnings("unchecked") Map<String, Object> metadata = (Map<String, Object>) read(root).get("otherRootData");
        assertEquals((short) 42, metadata.get("short")); assertEquals(123456, metadata.get("int"));
        assertEquals(123456789012L, metadata.get("long")); assertEquals(1.25f, metadata.get("float")); assertEquals(9.5, metadata.get("double"));
        assertArrayEquals(new byte[]{1, 2, 3}, (byte[]) metadata.get("bytes"));
        assertArrayEquals(new int[]{6, 7}, (int[]) metadata.get("ints")); assertArrayEquals(new long[]{8, 9}, (long[]) metadata.get("longs"));
        assertEquals(Collections.emptyList(), metadata.get("empty"));
        assertArrayEquals(original, Files.readAllBytes(root.resolve("servers.dat.yapapouaiye.bak")));
    }
    @Test public void updatesManagedAddressesAndRemovesOnlyObsoleteManagedServers() throws Exception {
        Path root = game(); Files.write(root.resolve("servers.dat"), fixture("Personal", "personal.test", false));
        MinecraftServers.synchronize(root, List.of(server("first", "Old name", "old.test", 1), server("removed", "Retired", "retired.test", 2)));
        MinecraftServers.synchronize(root, List.of(server("first", "New name", "new.test", 3)));
        List<Map<String, Object>> values = servers(root);
        assertEquals(2, values.size()); assertEquals("Personal", values.get(0).get("name"));
        assertEquals("New name", values.get(1).get("name")); assertEquals("new.test:3", values.get(1).get("ip"));
    }
    @Test public void preservesExistingEndpointWithoutRenamingOrDuplicatingIt() throws Exception {
        Path root = game(); Files.write(root.resolve("servers.dat"), fixture("My name", "EXAMPLE.TEST", true));
        MinecraftServers.synchronize(root, List.of(server("one", "Official name", "example.test", 25565), server("two", "Other card", "example.test", 25565)));
        assertEquals(1, servers(root).size()); assertEquals("My name", servers(root).get(0).get("name"));
        MinecraftServers.synchronize(root, Collections.emptyList());
        assertEquals("Custom servers survive catalogue removal", 1, servers(root).size());
        Path ipv6 = game(); Files.write(ipv6.resolve("servers.dat"), fixture("IPv6 custom", "[2001:db8::1]", false));
        MinecraftServers.synchronize(ipv6, List.of(server("one", "Official", "2001:db8::1", 25565)));
        assertEquals(1, servers(ipv6).size());
    }
    @Test public void userRenamedManagedEntryBecomesPersonal() throws Exception {
        Path root = game();
        MinecraftServers.synchronize(root, List.of(server("one", "Official", "example.test", 25565)));
        Files.write(root.resolve("servers.dat"), fixture("My renamed server", "example.test:25565", true));
        MinecraftServers.synchronize(root, List.of(server("one", "Official", "example.test", 25565)));
        MinecraftServers.synchronize(root, Collections.emptyList());
        assertEquals(1, servers(root).size()); assertEquals("My renamed server", servers(root).get(0).get("name"));
    }
    @Test public void repeatedRefreshDoesNotReorderOrDuplicateEntries() throws Exception {
        Path root = game(); List<LauncherApi.Server> catalogue = List.of(server("one", "One", "one.test", 25565), server("two", "Two", "two.test", 12345));
        MinecraftServers.synchronize(root, catalogue); byte[] first = Files.readAllBytes(root.resolve("servers.dat"));
        MinecraftServers.synchronize(root, catalogue); assertArrayEquals(first, Files.readAllBytes(root.resolve("servers.dat")));
        assertFalse(Files.exists(root.resolve("servers.dat.yapapouaiye.bak")));
    }
    @Test public void readsLegacyGzipAndRetainsTheCompressedOriginalAsBackup() throws Exception {
        Path root = game(); ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) { gzip.write(fixture("Old custom", "old.test", true)); }
        Files.write(root.resolve("servers.dat"), compressed.toByteArray());
        MinecraftServers.synchronize(root, List.of(server("one", "New", "new.test", 25565)));
        assertEquals(2, servers(root).size()); assertTrue(read(root).containsKey("otherRootData"));
        assertArrayEquals(compressed.toByteArray(), Files.readAllBytes(root.resolve("servers.dat.yapapouaiye.bak")));
    }
    @Test public void corruptNbtCannotReplaceExistingServers() throws Exception {
        List<byte[]> corrupt = Arrays.asList(new byte[]{1, 2, 3}, new byte[]{10, 0, 0, 9, 0, 7, 's', 'e', 'r', 'v', 'e', 'r', 's', 8, 127, -1, -1, -1},
            Arrays.copyOf(fixture("Custom", "custom.test", false), 20));
        for (byte[] original : corrupt) {
            Path root = game(); Files.write(root.resolve("servers.dat"), original);
            assertThrows(IOException.class, () -> MinecraftServers.synchronize(root, List.of(server("one", "One", "one.test", 25565))));
            assertArrayEquals(original, Files.readAllBytes(root.resolve("servers.dat")));
            assertFalse(Files.exists(root.resolve(".yapapouaiye-managed-servers.json")));
        }
    }
    @Test public void invalidInventoryAndDestinationsCannotDestroyPersonalFiles() throws Exception {
        Path root = game(); byte[] original = fixture("Custom", "custom.test", false);
        Files.write(root.resolve("servers.dat"), original);
        Files.write(root.resolve(".yapapouaiye-managed-servers.json"), "[{\"id\":\"../bad\"}]".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> MinecraftServers.synchronize(root, Collections.emptyList()));
        assertArrayEquals(original, Files.readAllBytes(root.resolve("servers.dat")));
        Path directory = game(); Files.createDirectory(directory.resolve("servers.dat"));
        Files.write(directory.resolve("servers.dat/personal.txt"), "keep".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> MinecraftServers.synchronize(directory, Collections.emptyList()));
        assertEquals("keep", new String(Files.readAllBytes(directory.resolve("servers.dat/personal.txt")), StandardCharsets.UTF_8));
    }
    @Test public void rejectsInvalidCatalogueBeforeWritingFiles() throws Exception {
        Path root = game();
        assertThrows(IOException.class, () -> MinecraftServers.synchronize(root, List.of(server("../outside", "One", "one.test", 25565))));
        assertThrows(IOException.class, () -> MinecraftServers.synchronize(root, List.of(server("one", "One", "one.test", 0))));
        assertThrows(IOException.class, () -> MinecraftServers.synchronize(root, List.of(server("one", "One", "https://one.test/path", 25565))));
        assertFalse(Files.exists(root.resolve("servers.dat")));
    }
}
