/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import static org.junit.Assert.*;

public class EmbeddedModsTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private Path game() throws IOException { return temporary.newFolder().toPath(); }
    private Path zip(String name, byte[] contents) throws IOException {
        Path file = temporary.newFile().toPath();
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(file))) {
            zip.putNextEntry(new ZipEntry("overrides/mods/" + name)); zip.write(contents); zip.closeEntry();
        }
        return file;
    }
    private EmbeddedMods.Entry entry(String name, byte[] bytes) throws IOException {
        Path file = temporary.newFile().toPath(); Files.write(file, bytes);
        return new EmbeddedMods.Entry(name, bytes.length, EmbeddedMods.digest(file));
    }
    private byte[] bytes(String text) { return text.getBytes(StandardCharsets.UTF_8); }

    @Test public void repairsBundledModAndPreservesCustomFilesAndPreviousContents() throws Exception {
        Path root = game(); Files.createDirectories(root.resolve("mods"));
        Files.write(root.resolve("mods/server.jar"), bytes("modified"));
        Files.write(root.resolve("mods/custom.jar"), bytes("my custom mod"));
        Files.createDirectories(root.resolve("config")); Files.write(root.resolve("config/user.txt"), bytes("settings"));
        EmbeddedMods.synchronize(root, zip("server.jar", bytes("server")), List.of(entry("server.jar", bytes("server"))));
        assertArrayEquals(bytes("server"), Files.readAllBytes(root.resolve("mods/server.jar")));
        assertArrayEquals(bytes("my custom mod"), Files.readAllBytes(root.resolve("mods/custom.jar")));
        assertArrayEquals(bytes("settings"), Files.readAllBytes(root.resolve("config/user.txt")));
        try (var backups = Files.list(root.resolve(".yapapouaiye-backups"))) {
            List<Path> files = backups.toList(); assertEquals(1, files.size());
            assertArrayEquals(bytes("modified"), Files.readAllBytes(files.get(0)));
        }
        EmbeddedMods.synchronize(root, zip("server.jar", bytes("server")), List.of(entry("server.jar", bytes("server"))));
        try (var backups = Files.list(root.resolve(".yapapouaiye-backups"))) { assertEquals(1, backups.count()); }
    }
    @Test public void rejectsCorruptArchiveWithoutReplacingInstalledMod() throws Exception {
        Path root = game(); Files.createDirectories(root.resolve("mods"));
        Files.write(root.resolve("mods/server.jar"), bytes("original"));
        assertThrows(IOException.class, () -> EmbeddedMods.synchronize(root, zip("server.jar", bytes("broken")), List.of(entry("server.jar", bytes("server")))));
        assertArrayEquals(bytes("original"), Files.readAllBytes(root.resolve("mods/server.jar")));
        try (var files = Files.list(root.resolve("mods"))) { assertEquals(1, files.count()); }
    }
    @Test public void rejectsTraversalAndCaseInsensitiveDuplicates() throws Exception {
        Path root = game(); Path archive = zip("server.jar", bytes("server"));
        assertThrows(IOException.class, () -> EmbeddedMods.synchronize(root, archive, List.of(entry("../outside.jar", bytes("server")))));
        assertThrows(IOException.class, () -> EmbeddedMods.synchronize(root, archive, List.of(entry("server.jar", bytes("server")), entry("SERVER.jar", bytes("server")))));
        assertFalse(Files.exists(root.resolve(".yapapouaiye-managed-mods.json")));
    }
    @Test public void removesOnlyUnmodifiedPreviouslyManagedMods() throws Exception {
        Path root = game();
        EmbeddedMods.synchronize(root, zip("old.jar", bytes("old")), List.of(entry("old.jar", bytes("old"))));
        Files.write(root.resolve("mods/custom.jar"), bytes("custom"));
        EmbeddedMods.synchronize(root, zip("new.jar", bytes("new")), List.of(entry("new.jar", bytes("new"))));
        assertFalse(Files.exists(root.resolve("mods/old.jar")));
        assertTrue(Files.exists(root.resolve("mods/new.jar")));
        assertArrayEquals(bytes("custom"), Files.readAllBytes(root.resolve("mods/custom.jar")));
    }
    @Test public void refusesToDeleteModifiedObsoleteMod() throws Exception {
        Path root = game();
        EmbeddedMods.synchronize(root, zip("old.jar", bytes("old")), List.of(entry("old.jar", bytes("old"))));
        Files.write(root.resolve("mods/old.jar"), bytes("changed by user"));
        assertThrows(IOException.class, () -> EmbeddedMods.synchronize(root, zip("new.jar", bytes("new")), List.of(entry("new.jar", bytes("new")))));
        assertArrayEquals(bytes("changed by user"), Files.readAllBytes(root.resolve("mods/old.jar")));
    }
    @Test public void supportsEmptyVanillaInventoryWithoutDeletingCustomMods() throws Exception {
        Path root = game();
        EmbeddedMods.synchronize(root, zip("old.jar", bytes("old")), List.of(entry("old.jar", bytes("old"))));
        Files.write(root.resolve("mods/custom.jar"), bytes("custom"));
        Path empty = temporary.newFile().toPath();
        try (ZipOutputStream archive = new ZipOutputStream(Files.newOutputStream(empty))) {
            archive.putNextEntry(new ZipEntry("modrinth.index.json")); archive.write(bytes("{}")); archive.closeEntry();
        }
        EmbeddedMods.synchronize(root, empty, List.of());
        assertFalse(Files.exists(root.resolve("mods/old.jar")));
        assertArrayEquals(bytes("custom"), Files.readAllBytes(root.resolve("mods/custom.jar")));
    }
    @Test public void refusesNonRegularDestinationWithoutChangingContents() throws Exception {
        Path root = game(); Files.createDirectories(root.resolve("mods/server.jar"));
        Files.write(root.resolve("mods/server.jar/user.txt"), bytes("protected"));
        assertThrows(IOException.class, () -> EmbeddedMods.synchronize(root, zip("server.jar", bytes("server")), List.of(entry("server.jar", bytes("server")))));
        assertArrayEquals(bytes("protected"), Files.readAllBytes(root.resolve("mods/server.jar/user.txt")));
    }
}
