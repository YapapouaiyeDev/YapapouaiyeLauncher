/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.google.gson.Gson;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Owns only the bundled server mods. Other files and custom mods remain untouched. */
public final class EmbeddedMods {
    public static final class Entry {
        public String name;
        public long size;
        public String sha256;
        public Entry(String name, long size, String sha256) {
            this.name = name; this.size = size; this.sha256 = sha256;
        }
    }
    private static final Gson JSON = new Gson();
    private EmbeddedMods() { }

    private static void validate(Entry entry) throws IOException {
        if (entry == null || entry.name == null || !entry.name.matches("[A-Za-z0-9_().+ -]+\\.jar") ||
                entry.size <= 0 || entry.size > 1024L * 1024 * 1024 || entry.sha256 == null ||
                !entry.sha256.matches("[a-f0-9]{64}")) throw new IOException("Inventaire de mods invalide.");
    }
    public static String digest(Path file) throws IOException {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException error) { throw new AssertionError(error); }
        try (InputStream input = Files.newInputStream(file)) {
            byte[] bytes = new byte[65536];
            for (int length; (length = input.read(bytes)) != -1;) {
                if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException();
                digest.update(bytes, 0, length);
            }
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", value & 255));
        return hex.toString();
    }
    private static void regularOrAbsent(Path file) throws IOException {
        if (Files.exists(file, LinkOption.NOFOLLOW_LINKS) && !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS))
            throw new IOException("Fichier ou lien inattendu : " + file.getFileName());
    }
    private static void move(Path source, Path target) throws IOException {
        try { Files.move(source, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException ignored) { Files.move(source, target, StandardCopyOption.REPLACE_EXISTING); }
    }
    public static void synchronize(Path game, Path archive, List<Entry> expected) throws IOException {
        Set<String> names = new HashSet<>();
        for (Entry entry : expected) {
            validate(entry);
            if (!names.add(entry.name.toLowerCase(Locale.ROOT))) throw new IOException("Mod en double : " + entry.name);
        }
        Path root = game.toRealPath();
        Path mods = root.resolve("mods");
        Files.createDirectories(mods);
        if (!mods.toRealPath().equals(mods)) throw new IOException("Le dossier de mods ne doit pas être un lien.");
        Path record = root.resolve(".yapapouaiye-managed-mods.json");
        regularOrAbsent(record);
        List<Entry> previous = Collections.emptyList();
        if (Files.exists(record)) {
            try {
                Entry[] entries = JSON.fromJson(new String(Files.readAllBytes(record), StandardCharsets.UTF_8), Entry[].class);
                if (entries == null) throw new IOException("Suivi des mods illisible.");
                previous = Arrays.asList(entries);
                for (Entry entry : previous) validate(entry);
            } catch (RuntimeException error) { throw new IOException("Suivi des mods illisible. Aucun ancien mod supprimé.", error); }
        }
        // Validate all entry names and sizes before replacing installed files.
        try (ZipFile zip = new ZipFile(archive.toFile())) {
            for (Entry entry : expected) {
                ZipEntry source = zip.getEntry("overrides/mods/" + entry.name);
                if (source == null || source.getSize() != entry.size) throw new IOException("Mod absent du pack : " + entry.name);
                regularOrAbsent(mods.resolve(entry.name));
            }
            for (Entry entry : expected) {
                Path target = mods.resolve(entry.name);
                if (Files.isRegularFile(target) && Files.size(target) == entry.size && digest(target).equals(entry.sha256)) continue;
                Path temporary = Files.createTempFile(mods, ".yapapouaiye-", ".part");
                try {
                    try (InputStream input = zip.getInputStream(zip.getEntry("overrides/mods/" + entry.name));
                            OutputStream output = Files.newOutputStream(temporary)) {
                        byte[] bytes = new byte[65536];
                        long total = 0;
                        for (int length; (length = input.read(bytes)) != -1;) {
                            if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException();
                            total += length;
                            if (total > entry.size) throw new IOException("Mod trop volumineux : " + entry.name);
                            output.write(bytes, 0, length);
                        }
                    }
                    if (Files.size(temporary) != entry.size || !digest(temporary).equals(entry.sha256))
                        throw new IOException("Mod endommagé dans le pack : " + entry.name);
                    if (Files.exists(target)) {
                        Path backups = root.resolve(".yapapouaiye-backups");
                        Files.createDirectories(backups);
                        if (!backups.toRealPath().equals(backups)) throw new IOException("Dossier de sauvegarde invalide.");
                        String oldHash = digest(target);
                        Path backup = backups.resolve(entry.name + "." + oldHash + ".bak");
                        regularOrAbsent(backup);
                        if (Files.exists(backup)) {
                            if (!digest(backup).equals(oldHash)) throw new IOException("Sauvegarde de mod endommagée.");
                        } else Files.copy(target, backup);
                    }
                    move(temporary, target);
                } finally { Files.deleteIfExists(temporary); }
            }
        }
        for (Entry old : previous) {
            if (names.contains(old.name.toLowerCase(Locale.ROOT))) continue;
            Path stale = mods.resolve(old.name);
            regularOrAbsent(stale);
            if (!Files.exists(stale)) continue;
            if (!digest(stale).equals(old.sha256)) throw new IOException("Ancien mod modifié conservé : " + old.name + ". Retire-le des mods avant de rejouer.");
            Files.delete(stale);
        }
        Path temporaryRecord = Files.createTempFile(root, ".yapapouaiye-inventory-", ".tmp");
        try {
            Files.write(temporaryRecord, JSON.toJson(expected).getBytes(StandardCharsets.UTF_8));
            move(temporaryRecord, record);
        } finally { Files.deleteIfExists(temporaryRecord); }
    }
}
