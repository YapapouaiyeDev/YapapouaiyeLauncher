/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.google.gson.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;

/** Native-only network boundary. Web content cannot choose endpoints or file paths. */
public final class LauncherApi {
    public static final String BASE = "https://yapapouaiye-launcher.pages.dev";
    private static final Gson JSON = new Gson();
    public static final class Server {
        public String id, name, host, gameVersion, defaultLoader, description;
        public int gamePort, sortOrder, codesCount;
        public boolean codesRequired;
        public String address() { return (host.contains(":") && !host.startsWith("[") ? "[" + host + "]" : host) + ":" + gamePort; }
        public boolean sameGame(Server other) {
            return id.equals(other.id) && gameVersion.equals(other.gameVersion) && defaultLoader.equals(other.defaultLoader);
        }
    }
    public static final class Pack {
        public File file;
        public String loaderVersion;
        public List<EmbeddedMods.Entry> mods;
        public String versionId(Server server) { return "Yapa-" + server.gameVersion + "-" + server.defaultLoader + (loaderVersion.isEmpty() ? "" : "-" + loaderVersion); }
    }
    public interface Progress { void update(String message); }

    private static IOException invalid() { return new IOException("Réponse invalide de l’API du launcher."); }
    private static String string(JsonObject obj, String name, int max) throws IOException {
        JsonElement value = obj.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw invalid();
        String text = value.getAsString();
        if (text.length() > max) throw invalid();
        return text;
    }
    private static boolean bool(JsonObject obj, String key, boolean fallback) throws IOException {
        if (!obj.has(key)) return fallback;
        JsonElement value = obj.get(key);
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean()) throw invalid();
        return value.getAsBoolean();
    }
    private static int integer(JsonObject obj, String key, int min, int max) throws IOException {
        try {
            JsonElement value = obj.get(key);
            if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) throw invalid();
            int number = value.getAsBigDecimal().intValueExact();
            if (number < min || number > max) throw invalid();
            return number;
        } catch (RuntimeException e) { throw invalid(); }
    }
    public static List<Server> parseCatalog(String text) throws IOException {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            if (!bool(root, "ok", false) || !root.get("servers").isJsonArray() || root.getAsJsonArray("servers").size() > 500) throw invalid();
            List<Server> servers = new ArrayList<>();
            Set<String> ids = new HashSet<>();
            for (JsonElement item : root.getAsJsonArray("servers")) {
                JsonObject obj = item.getAsJsonObject();
                if (!bool(obj, "enabled", true)) continue;
                Server server = new Server();
                server.id = string(obj, "id", 128);
                server.name = string(obj, "name", 255);
                server.host = canonicalHost(string(obj, "host", 255));
                server.gameVersion = string(obj, "gameVersion", 64);
                server.defaultLoader = string(obj, "defaultLoader", 32);
                server.description = obj.has("description") ? string(obj, "description", 500) : "";
                server.gamePort = integer(obj, "gamePort", 1, 65535);
                server.sortOrder = obj.has("sortOrder") ? integer(obj, "sortOrder", 0, 999) : 0;
                server.codesRequired = bool(obj, "codesRequired", false);
                server.codesCount = obj.has("codesCount") ? integer(obj, "codesCount", 0, 20) : 0;
                if (!server.id.matches("[A-Za-z0-9_-]+") || server.name.trim().isEmpty() ||
                    !server.host.matches("[a-zA-Z0-9.\\[\\]:_-]+") || !server.gameVersion.matches("[a-zA-Z0-9._-]+") ||
                    !Arrays.asList("neoforge", "forge", "fabric", "vanilla").contains(server.defaultLoader) ||
                    !ids.add(server.id.toLowerCase(Locale.ROOT)) || (server.codesRequired && server.codesCount == 0)) throw invalid();
                servers.add(server);
            }
            servers.sort(Comparator.comparingInt((Server s) -> s.sortOrder).thenComparing(s -> s.id));
            return servers;
        } catch (RuntimeException e) { throw invalid(); }
    }
    /** Older catalogue entries include a port in host. gamePort remains authoritative. */
    private static String canonicalHost(String value) throws IOException {
        String host = value;
        if (value.startsWith("[")) {
            int end = value.indexOf(']');
            if (end < 0) throw invalid();
            host = value.substring(1, end);
            String suffix = value.substring(end + 1);
            if (!suffix.isEmpty()) {
                if (!suffix.startsWith(":")) throw invalid();
                embeddedPort(suffix.substring(1));
            }
            if (!host.contains(":")) throw invalid();
        } else if (value.indexOf(':') >= 0 && value.indexOf(':') == value.lastIndexOf(':')) {
            int separator = value.indexOf(':');
            embeddedPort(value.substring(separator + 1));
            host = value.substring(0, separator);
        }
        if (host.contains(":")) {
            // URI validates the literal locally; this must never resolve a DNS name.
            if (!host.matches("[A-Fa-f0-9:.]+")) throw invalid();
            try { if (new URI("http://[" + host + "]/").getHost() == null) throw invalid(); }
            catch (URISyntaxException error) { throw invalid(); }
        } else if (!host.matches("[a-zA-Z0-9_-]+(?:\\.[a-zA-Z0-9_-]+)*\\.?")) throw invalid();
        return host;
    }
    private static void embeddedPort(String value) throws IOException {
        try {
            if (!value.matches("[0-9]{1,5}")) throw invalid();
            int port = Integer.parseInt(value);
            if (port < 1 || port > 65535) throw invalid();
        } catch (NumberFormatException error) { throw invalid(); }
    }
    private static HttpURLConnection connect(String url, JsonObject body) throws IOException {
        interrupted();
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("User-Agent", "YapapouaiyeAndroid/1");
        try {
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] data = JSON.toJson(body).getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(data.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(data); }
            }
            if (connection.getResponseCode() != 200) {
                String message = "API indisponible (HTTP " + connection.getResponseCode() + "). Réessaie avec une connexion Internet.";
                InputStream error = connection.getErrorStream();
                if (error != null) try (InputStream input = error) {
                    JsonObject obj = JsonParser.parseString(readText(input, 16384)).getAsJsonObject();
                    if (obj.has("error")) message = string(obj, "error", 2000);
                } catch (RuntimeException | IOException ignored) { }
                throw new IOException(message);
            }
            return connection;
        } catch (IOException | RuntimeException e) { connection.disconnect(); throw e; }
    }
    private static void interrupted() throws InterruptedIOException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Téléchargement interrompu.");
    }
    private static String readText(InputStream input, int max) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int size; (size = input.read(buffer)) != -1;) {
            interrupted();
            if (output.size() + size > max) throw invalid();
            output.write(buffer, 0, size);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }
    private static String request(String url, JsonObject body) throws IOException {
        HttpURLConnection connection = connect(url, body);
        try (InputStream input = connection.getInputStream()) { return readText(input, 4 * 1024 * 1024); }
        finally { connection.disconnect(); }
    }
    public List<Server> catalog() throws IOException {
        try {
            JsonObject config = JsonParser.parseString(request(BASE + "/api/launcher-config", null)).getAsJsonObject();
            if (!bool(config, "ok", false)) throw invalid();
            if (bool(config, "maintenance", false)) throw new IOException(config.has("message") ? string(config, "message", 2000) : "Launcher en maintenance.");
            return parseCatalog(request(BASE + "/api/servers", null));
        } catch (RuntimeException e) { throw invalid(); }
    }
    public Server current(String id) throws IOException {
        return catalog().stream().filter(s -> s.id.equals(id)).findFirst().orElseThrow(() -> new IOException("Ce serveur a été désactivé ou supprimé. Actualise la liste."));
    }
    private static JsonObject authorization(Server server, List<String> codes) {
        JsonObject body = new JsonObject(); body.addProperty("serverId", server.id); body.add("codes", JSON.toJsonTree(codes)); return body;
    }
    public void verify(Server server, List<String> codes) throws IOException {
        try {
            JsonObject result = JsonParser.parseString(request(BASE + "/api/server-verify", authorization(server, codes))).getAsJsonObject();
            if (!bool(result, "ok", false) || !bool(result, "valid", false)) throw new IOException("Codes d’accès incorrects.");
        } catch (RuntimeException e) { throw invalid(); }
    }
    private String loaderVersion(Server server) throws IOException {
        switch (server.defaultLoader) {
            case "vanilla": return "";
            case "fabric": {
                JsonArray builds = JsonParser.parseString(request("https://meta.fabricmc.net/v2/versions/loader/" + server.gameVersion, null)).getAsJsonArray();
                for (JsonElement build : builds) {
                    JsonObject loader = build.getAsJsonObject().getAsJsonObject("loader");
                    if (bool(loader, "stable", false)) return checkedVersion(string(loader, "version", 64));
                }
                break;
            }
            case "neoforge": {
                String prefix = server.gameVersion.startsWith("1.") ? server.gameVersion.substring(2) + "." : server.gameVersion + ".";
                Matcher versions = Pattern.compile("<version>([^<]+)</version>").matcher(request("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml", null));
                String latest = null;
                while (versions.find()) {
                    String value = versions.group(1);
                    if (value.startsWith(prefix) && value.matches("[0-9.]+")) latest = value;
                }
                if (latest != null) return checkedVersion(latest);
                break;
            }
            case "forge": {
                JsonObject promos = JsonParser.parseString(request("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json", null)).getAsJsonObject().getAsJsonObject("promos");
                JsonElement version = promos.get(server.gameVersion + "-recommended");
                if (version == null) version = promos.get(server.gameVersion + "-latest");
                if (version != null) return checkedVersion(version.getAsString());
                break;
            }
        }
        throw new IOException("Aucune version compatible du loader pour Minecraft " + server.gameVersion + ".");
    }
    private static String checkedVersion(String value) throws IOException {
        if (!value.matches("[a-zA-Z0-9._-]{1,64}")) throw invalid();
        return value;
    }
    public Pack prepare(Server server, List<String> codes, File cache, List<File> companions, Progress progress) throws IOException {
        try {
            JsonObject manifest = JsonParser.parseString(request(BASE + "/api/android-mods", authorization(server, codes))).getAsJsonObject();
            if (!bool(manifest, "ok", false) || !server.id.equals(string(manifest, "serverId", 128)) ||
                !server.gameVersion.equals(string(manifest, "gameVersion", 64)) || !server.defaultLoader.equals(string(manifest, "loader", 32)))
                throw new IOException("La configuration du serveur a changé. Réessaie.");
            Pack pack = new Pack(); pack.mods = new ArrayList<>(); pack.loaderVersion = loaderVersion(server);
            File directory = new File(cache, server.id);
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Impossible de créer le cache du serveur.");
            JsonArray files = manifest.getAsJsonArray("files");
            if (files == null || files.size() > 500) throw invalid();
            Set<String> names = new HashSet<>();
            List<File> downloaded = new ArrayList<>();
            int index = 0;
            for (JsonElement item : files) {
                JsonObject entry = item.getAsJsonObject();
                String name = string(entry, "name", 240), expected = string(entry, "hash", 64), algorithm = string(entry, "algorithm", 16);
                long size = integer(entry, "size", 1, 1024 * 1024 * 1024);
                if (!name.matches("[A-Za-z0-9_().+ -]+\\.jar") || !names.add(name.toLowerCase(Locale.ROOT)) ||
                    !(algorithm.equals("git-sha1") ? expected.matches("[a-f0-9]{40}") : algorithm.equals("md5") && expected.matches("[a-f0-9]{32}"))) throw invalid();
                progress.update("Téléchargement des mods : " + (++index) + "/" + files.size() + " · " + name);
                File target = new File(directory, expected + ".jar");
                if (!target.isFile() || target.length() != size || !fileHash(target, algorithm).equals(expected)) {
                    JsonObject body = authorization(server, codes); body.addProperty("file", name);
                    HttpURLConnection connection = connect(BASE + "/api/android-mods", body);
                    File temporary = File.createTempFile("mod-", ".part", directory);
                    try {
                        try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(temporary)) {
                            byte[] buffer = new byte[65536]; long total = 0;
                            for (int length; (length = input.read(buffer)) != -1;) {
                                interrupted(); total += length;
                                if (total > size) throw new IOException("Mod trop volumineux : " + name);
                                output.write(buffer, 0, length);
                            }
                        }
                        if (temporary.length() != size || !fileHash(temporary, algorithm).equals(expected)) throw new IOException("Mod corrompu ou modifié sur le serveur : " + name + ". Réessaie.");
                        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    } finally { connection.disconnect(); Files.deleteIfExists(temporary.toPath()); }
                }
                downloaded.add(target);
                pack.mods.add(new EmbeddedMods.Entry(name, size, EmbeddedMods.digest(target.toPath())));
            }
            validateLoader(downloaded, server.defaultLoader);
            if (companions != null) for (File companion : companions) {
                // The project companion takes precedence over an older copy in the remote repository.
                for (int i = pack.mods.size() - 1; i >= 0; i--) if (pack.mods.get(i).name.equalsIgnoreCase(companion.getName()) ||
                    companion.getName().startsWith("nexlux-") && pack.mods.get(i).name.matches("(?i)nexlux(?:-.*)?\\.jar")) { pack.mods.remove(i); downloaded.remove(i); }
                pack.mods.add(new EmbeddedMods.Entry(companion.getName(), companion.length(), EmbeddedMods.digest(companion.toPath())));
                downloaded.add(companion);
            }
            pack.file = new File(directory, "server.mrpack");
            File temporary = File.createTempFile("pack-", ".part", directory);
            try {
                try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(temporary))) {
                    JsonObject deps = new JsonObject(); deps.addProperty("minecraft", server.gameVersion);
                    if (!server.defaultLoader.equals("vanilla")) deps.addProperty(server.defaultLoader.equals("fabric") ? "fabric-loader" : server.defaultLoader, pack.loaderVersion);
                    JsonObject mrpack = new JsonObject(); mrpack.addProperty("formatVersion", 1); mrpack.addProperty("game", "minecraft");
                    mrpack.addProperty("name", server.name); mrpack.addProperty("versionId", pack.versionId(server));
                    mrpack.add("files", new JsonArray()); mrpack.add("dependencies", deps);
                    zip.putNextEntry(new ZipEntry("modrinth.index.json")); zip.write(JSON.toJson(mrpack).getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
                    // Install only the game/loader here. EmbeddedMods owns mod repair and safe replacement.
                    zip.putNextEntry(new ZipEntry("overrides/options.txt")); zip.write("renderDistance:6\nsimulationDistance:4\nmaxFps:60\n".getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
                    for (int i = 0; i < downloaded.size(); i++) {
                        interrupted(); zip.putNextEntry(new ZipEntry("overrides/mods/" + pack.mods.get(i).name));
                        Files.copy(downloaded.get(i).toPath(), zip); zip.closeEntry();
                    }
                }
                Files.move(temporary.toPath(), pack.file.toPath(), StandardCopyOption.REPLACE_EXISTING);
            } finally { Files.deleteIfExists(temporary.toPath()); }
            return pack;
        } catch (RuntimeException e) { throw new IOException("Configuration des mods ou du loader invalide.", e); }
    }
    static void validateLoader(List<File> files, String loader) throws IOException {
        int declared = 0, matching = 0;
        for (File file : files) {
            try (ZipFile jar = new ZipFile(file)) {
                boolean fabric = jar.getEntry("fabric.mod.json") != null;
                boolean neo = jar.getEntry("META-INF/neoforge.mods.toml") != null;
                boolean forge = jar.getEntry("META-INF/mods.toml") != null;
                if (fabric || neo || forge) declared++;
                if ((loader.equals("fabric") && fabric) || (loader.equals("neoforge") && neo) || (loader.equals("forge") && forge)) matching++;
            }
        }
        if (declared > 0 && matching == 0) throw new IOException("Le catalogue indique " + loader + ", mais aucun mod du dépôt ne correspond. Le propriétaire doit corriger le loader ou les mods dans l’API Yapapouaiye.");
    }
    private static String fileHash(File file, String algorithm) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance(algorithm.equals("git-sha1") ? "SHA-1" : "MD5");
            if (algorithm.equals("git-sha1")) digest.update(("blob " + file.length() + "\0").getBytes(StandardCharsets.UTF_8));
            try (InputStream input = new FileInputStream(file)) {
                byte[] bytes = new byte[65536];
                for (int size; (size = input.read(bytes)) != -1;) { interrupted(); digest.update(bytes, 0, size); }
            }
            StringBuilder hex = new StringBuilder(); for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) { throw new AssertionError(e); }
    }
}
