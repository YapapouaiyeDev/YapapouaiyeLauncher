/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;
public class GameOptionsTest {
    @Test public void repairsInvalidFullBrightEvenWithCustomPresetAndPreservesOtherOptions() throws Exception {
        Path dir=Files.createTempDirectory("yapa-gamma");Path file=dir.resolve("options.txt");
        try {
            String before="gamma:100.0\nrenderDistance:8\nkey_key.jump:key.keyboard.j\n";write(file,before);
            GameOptions.apply(dir,"custom");String after=read(file);assertTrue(after.contains("gamma:1.0"));assertTrue(after.contains("renderDistance:8"));assertTrue(after.contains("key_key.jump:key.keyboard.j"));
            assertEquals(before,read(dir.resolve("options-before-yapapouaiye.txt")));GameOptions.apply(dir,"custom");assertEquals(after,read(file));
        } finally {try(var files=Files.list(dir)){files.forEach(f->{try{Files.delete(f);}catch(Exception e){throw new RuntimeException(e);}});}Files.delete(dir);}
    }
    private String read(Path file) throws Exception { return new String(Files.readAllBytes(file), StandardCharsets.UTF_8); }
    private void write(Path file, String value) throws Exception { Files.write(file, value.getBytes(StandardCharsets.UTF_8)); }
    @Test public void newInstallationStartsInFrenchWithoutChangingExistingLanguage() throws Exception {
        Path dir = Files.createTempDirectory("yapa-language");
        try {
            Path options = dir.resolve("options.txt");
            GameOptions.apply(dir, "custom"); assertTrue(read(options).contains("lang:fr_fr"));
            write(options, "lang:en_us\n"); GameOptions.apply(dir, "performance");
            assertTrue(read(options).contains("lang:en_us"));
            assertFalse(read(options).contains("lang:fr_fr"));
        } finally { try (var files = Files.list(dir)) { files.forEach(f -> { try { Files.delete(f); } catch (Exception e) { throw new RuntimeException(e); } }); } Files.delete(dir); }
    }
    @Test public void presetsPreserveControlsModsAndBackup() throws Exception {
        Path dir = Files.createTempDirectory("yapa-options");
        try {
            Path options = dir.resolve("options.txt");
            String original = "key_key.jump:key.keyboard.space\nmod_option:preserved\nrenderDistance:32\n";
            write(options, original);
            GameOptions.apply(dir, "custom"); assertEquals(original, read(options));
            GameOptions.apply(dir, "performance");
            String fast = read(options);
            assertTrue(fast.contains("renderDistance:6")); assertTrue(fast.contains("key_key.jump:key.keyboard.space"));
            // Minecraft rejects values below 5 and silently keeps its heavier default.
            assertTrue(Files.readAllLines(options).contains("simulationDistance:5"));
            assertTrue(Files.readAllLines(options).contains("maxFps:60"));
            assertTrue(fast.contains("mod_option:preserved")); assertFalse(fast.contains("renderDistance:32"));
            GameOptions.apply(dir, "balanced"); assertTrue(read(options).contains("renderDistance:10"));
            assertEquals(original, read(dir.resolve("options-before-yapapouaiye.txt")));
        } finally { try (var files = Files.list(dir)) { files.forEach(f -> { try { Files.delete(f); } catch (Exception e) { throw new RuntimeException(e); } }); } Files.delete(dir); }
    }
}
