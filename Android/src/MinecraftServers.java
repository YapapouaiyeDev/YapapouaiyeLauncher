/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.google.gson.Gson;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.GZIPInputStream;

/** Adds the public catalogue to Java Edition's multiplayer screen in each isolated game directory. */
public final class MinecraftServers {
    private static final Gson JSON = new Gson();
    private static final int MAX_BYTES = 4 * 1024 * 1024, MAX_ITEMS = 65536;
    private static final String RECORD = ".yapapouaiye-managed-servers.json";
    private MinecraftServers() { }

    private static final class Entry {
        String id, name, address;
        Entry(String id, String name, String address) { this.id = id; this.name = name; this.address = address; }
    }
    private static final class Tag {
        final int type;
        final Object value;
        Tag(int type, Object value) { this.type = type; this.value = value; }
    }
    private static final class ListTag {
        final int type;
        final List<Tag> values;
        ListTag(int type, List<Tag> values) { this.type = type; this.values = values; }
    }
    private static final class Document {
        final String name;
        final Map<String, Tag> root;
        Document(String name, Map<String, Tag> root) { this.name = name; this.root = root; }
    }
    private static IOException invalid() { return new IOException("Liste des serveurs Minecraft illisible. Le fichier existant a été conservé."); }
    private static void regularOrAbsent(Path file) throws IOException {
        if (Files.exists(file, LinkOption.NOFOLLOW_LINKS) && !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS))
            throw new IOException("Fichier de serveurs inattendu : " + file.getFileName());
    }
    private static byte[] readFile(Path file) throws IOException {
        if (Files.size(file) > MAX_BYTES) throw invalid();
        try (InputStream input = Files.newInputStream(file)) { return readBytes(input); }
    }
    private static byte[] readBytes(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int size; (size = input.read(buffer)) != -1;) {
            if (output.size() + size > MAX_BYTES) throw invalid();
            output.write(buffer, 0, size);
        }
        return output.toByteArray();
    }
    private static void replace(Path file, byte[] data) throws IOException {
        Path temporary = Files.createTempFile(file.getParent(), ".yapapouaiye-servers-", ".tmp");
        try {
            Files.write(temporary, data);
            try { Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException ignored) { Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temporary); }
    }
    /** No DNS lookup: matching a saved address must never contact a server or resolve a hostname. */
    private static String addressKey(String value) {
        String address = value.trim().toLowerCase(Locale.ROOT);
        if (address.startsWith("[")) {
            int end = address.indexOf(']');
            if (end > 0) return address.substring(1, end) + ":" + (end + 1 == address.length() ? "25565" : address.substring(end + 2));
        }
        int colon = address.indexOf(':');
        if (colon < 0) return address + ":25565";
        if (colon != address.lastIndexOf(':')) return address + ":25565";
        return address;
    }
    private static void validate(Entry entry) throws IOException {
        if (entry == null || entry.id == null || !entry.id.matches("[A-Za-z0-9_-]{1,128}") ||
            entry.name == null || entry.name.trim().isEmpty() || entry.name.length() > 255 ||
            entry.address == null || entry.address.length() > 264 || !entry.address.matches("[A-Za-z0-9.\\[\\]:_-]+")) throw invalid();
    }
    @SuppressWarnings("unchecked") private static Map<String, Tag> compound(Tag tag) { return (Map<String, Tag>) tag.value; }
    private static String string(Map<String, Tag> server, String key) {
        Tag value = server.get(key); return value != null && value.type == 8 ? (String) value.value : null;
    }
    private static Tag matching(List<Tag> servers, Entry entry, boolean nameRequired) {
        for (Tag tag : servers) {
            Map<String, Tag> server = compound(tag);
            String ip = string(server, "ip");
            if (ip != null && addressKey(ip).equals(addressKey(entry.address)) &&
                (!nameRequired || entry.name.equals(string(server, "name")))) return tag;
        }
        return null;
    }
    /** Merges public names and game addresses only; access codes and account tokens never enter servers.dat. */
    public static void synchronize(Path game, List<LauncherApi.Server> catalogue) throws IOException {
        if (catalogue == null || catalogue.size() > 500) throw invalid();
        LinkedHashMap<String, Entry> desired = new LinkedHashMap<>();
        Set<String> addresses = new HashSet<>(), ids = new HashSet<>();
        for (LauncherApi.Server server : catalogue) {
            if (server == null || server.host == null || server.gamePort < 1 || server.gamePort > 65535) throw invalid();
            Entry entry = new Entry(server.id, server.name, server.address()); validate(entry);
            if (!ids.add(entry.id.toLowerCase(Locale.ROOT))) throw invalid();
            // Two catalogue cards for the same endpoint require one multiplayer entry.
            if (addresses.add(addressKey(entry.address))) desired.put(entry.id, entry);
        }
        Path root = game.toRealPath(), file = root.resolve("servers.dat"), record = root.resolve(RECORD);
        regularOrAbsent(file); regularOrAbsent(record);
        byte[] original = Files.exists(file) ? readFile(file) : null;
        Document document = original == null ? new Document("", new LinkedHashMap<>()) : decode(original);
        Tag existing = document.root.get("servers");
        if (existing != null && (existing.type != 9 || ((ListTag) existing.value).type != 10 && !((ListTag) existing.value).values.isEmpty())) throw invalid();
        List<Tag> servers = existing == null ? new ArrayList<>() : ((ListTag) existing.value).values;
        List<Entry> previous = Collections.emptyList();
        if (Files.exists(record)) {
            try {
                Entry[] entries = JSON.fromJson(new String(readFile(record), StandardCharsets.UTF_8), Entry[].class);
                if (entries == null || entries.length > 500) throw invalid();
                previous = Arrays.asList(entries);
                Set<String> recordedIds = new HashSet<>();
                for (Entry entry : previous) {
                    validate(entry); if (!recordedIds.add(entry.id)) throw invalid();
                }
            } catch (RuntimeException error) { throw invalid(); }
        }
        List<Entry> managed = new ArrayList<>();
        for (Entry old : previous) {
            Tag tag = matching(servers, old, true);
            if (tag == null) continue; // A user renamed or changed it: it is now their own entry.
            Entry next = desired.remove(old.id);
            if (next == null) { servers.remove(tag); continue; }
            Tag alreadyPresent = matching(servers, next, false);
            if (alreadyPresent != null && alreadyPresent != tag) { servers.remove(tag); continue; }
            Map<String, Tag> values = compound(tag);
            values.put("name", new Tag(8, next.name)); values.put("ip", new Tag(8, next.address));
            managed.add(next);
        }
        for (Entry next : desired.values()) {
            if (matching(servers, next, false) != null) continue; // Preserve custom names, icons and settings.
            Map<String, Tag> values = new LinkedHashMap<>();
            values.put("name", new Tag(8, next.name)); values.put("ip", new Tag(8, next.address));
            servers.add(new Tag(10, values)); managed.add(next);
        }
        document.root.put("servers", new Tag(9, new ListTag(10, servers)));
        byte[] encoded = encode(document);
        if (!Arrays.equals(original, encoded)) {
            if (original != null) {
                Path backup = root.resolve("servers.dat.yapapouaiye.bak"); regularOrAbsent(backup);
                if (!Files.exists(backup)) Files.write(backup, original, StandardOpenOption.CREATE_NEW);
            }
            replace(file, encoded);
        }
        // Write after the NBT file: interruption cannot cause personal entries to be claimed as managed.
        byte[] inventory = JSON.toJson(managed).getBytes(StandardCharsets.UTF_8);
        if (!Files.exists(record) || !Arrays.equals(readFile(record), inventory)) replace(record, inventory);
    }
    private static Document decode(byte[] bytes) throws IOException {
        if (bytes.length > 1 && (bytes[0] & 255) == 31 && (bytes[1] & 255) == 139)
            try (InputStream gzip = new GZIPInputStream(new ByteArrayInputStream(bytes))) { bytes = readBytes(gzip); }
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(bytes))) {
            if (input.readUnsignedByte() != 10) throw invalid();
            String name = input.readUTF();
            Tag root = readTag(input, 10, 0, new int[]{0});
            if (input.read() != -1) throw invalid();
            return new Document(name, compound(root));
        } catch (RuntimeException error) { throw invalid(); }
    }
    private static int size(DataInputStream input, int[] count) throws IOException {
        int length = input.readInt();
        if (length < 0 || length > MAX_ITEMS || count[0] + length > MAX_ITEMS) throw invalid();
        count[0] += length; return length;
    }
    private static Tag readTag(DataInputStream input, int type, int depth, int[] count) throws IOException {
        if (depth > 64 || ++count[0] > MAX_ITEMS) throw invalid();
        Object value;
        switch (type) {
            case 1: value = input.readByte(); break;
            case 2: value = input.readShort(); break;
            case 3: value = input.readInt(); break;
            case 4: value = input.readLong(); break;
            case 5: value = input.readFloat(); break;
            case 6: value = input.readDouble(); break;
            case 7: { byte[] array = new byte[size(input, count)]; input.readFully(array); value = array; break; }
            case 8: value = input.readUTF(); break;
            case 9: {
                int elementType = input.readUnsignedByte(), length = size(input, count);
                if (elementType > 12 || elementType == 0 && length != 0) throw invalid();
                List<Tag> list = new ArrayList<>();
                for (int i = 0; i < length; i++) list.add(readTag(input, elementType, depth + 1, count));
                value = new ListTag(elementType, list); break;
            }
            case 10: {
                Map<String, Tag> map = new LinkedHashMap<>(); int child;
                while ((child = input.readUnsignedByte()) != 0) {
                    String key = input.readUTF();
                    if (map.containsKey(key)) throw invalid();
                    map.put(key, readTag(input, child, depth + 1, count));
                }
                value = map; break;
            }
            case 11: { int[] array = new int[size(input, count)]; for (int i = 0; i < array.length; i++) array[i] = input.readInt(); value = array; break; }
            case 12: { long[] array = new long[size(input, count)]; for (int i = 0; i < array.length; i++) array[i] = input.readLong(); value = array; break; }
            default: throw invalid();
        }
        return new Tag(type, value);
    }
    private static byte[] encode(Document document) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.writeByte(10); output.writeUTF(document.name); writeTag(output, new Tag(10, document.root));
        }
        if (bytes.size() > MAX_BYTES) throw invalid();
        return bytes.toByteArray();
    }
    private static void writeTag(DataOutputStream output, Tag tag) throws IOException {
        switch (tag.type) {
            case 1: output.writeByte((Byte) tag.value); break;
            case 2: output.writeShort((Short) tag.value); break;
            case 3: output.writeInt((Integer) tag.value); break;
            case 4: output.writeLong((Long) tag.value); break;
            case 5: output.writeFloat((Float) tag.value); break;
            case 6: output.writeDouble((Double) tag.value); break;
            case 7: { byte[] array = (byte[]) tag.value; output.writeInt(array.length); output.write(array); break; }
            case 8: output.writeUTF((String) tag.value); break;
            case 9: {
                ListTag list = (ListTag) tag.value; output.writeByte(list.type); output.writeInt(list.values.size());
                for (Tag child : list.values) writeTag(output, child); break;
            }
            case 10:
                for (Map.Entry<String, Tag> child : compound(tag).entrySet()) {
                    output.writeByte(child.getValue().type); output.writeUTF(child.getKey()); writeTag(output, child.getValue());
                }
                output.writeByte(0); break;
            case 11: { int[] array = (int[]) tag.value; output.writeInt(array.length); for (int value : array) output.writeInt(value); break; }
            case 12: { long[] array = (long[]) tag.value; output.writeInt(array.length); for (long value : array) output.writeLong(value); break; }
            default: throw invalid();
        }
    }
}
