/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;
import com.google.gson.*;
import org.junit.Test;
import static org.junit.Assert.*;
public class LauncherUpdatesTest {
    @Test public void compatibleUpdatesRequireTheSameIdentityAndSignerAndAnIncreasingCode() throws Exception {
        LauncherUpdates.Release expected = new LauncherUpdates.Release("1.0.2-A", "", "a".repeat(64), 10);
        java.util.Set<String> key = java.util.Set.of("publisher-signature");
        LauncherUpdates.validateIdentity("com.voyzix.yla", 1060106, key, "com.voyzix.yla", "1.0.2-A", 1060107, key, expected);
        try {
            LauncherUpdates.validateIdentity("fr.yapapouaiye.launcher.android.debug", 1060105, key,
                "com.voyzix.yla", "1.0.2-A", 1060107, key, expected);
            fail("A renamed application cannot silently replace the previous package");
        } catch (LauncherUpdates.UpdateFailure failure) { assertTrue(failure.getMessage().contains("installée une fois séparément")); }
        try {
            LauncherUpdates.validateIdentity("com.voyzix.yla", 1060106, key, "com.voyzix.yla", "1.0.2-A", 1060107, java.util.Set.of("other-signature"), expected);
            fail("A different signer must never replace the installed app");
        } catch (LauncherUpdates.UpdateFailure failure) { assertTrue(failure.getMessage().contains("signature")); }
        try {
            LauncherUpdates.validateIdentity("com.voyzix.yla", 1060106, key, "com.voyzix.yla", "1.0.2-A", 1060106, key, expected);
            fail("The Android version code must increase");
        } catch (LauncherUpdates.UpdateFailure failure) { assertTrue(failure.getMessage().contains("version")); }
    }
    @Test public void aCachedApkIsReusableOnlyWithTheExactPublishedSizeAndSha256() throws Exception {
        java.nio.file.Path file = java.nio.file.Files.createTempFile("launcher-update-", ".apk");
        try {
            byte[] bytes = "downloaded-APK-content".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hash = new StringBuilder();
            for (byte b : digest) hash.append(String.format("%02x", b & 255));
            LauncherUpdates.Release release = new LauncherUpdates.Release("1.0.2-A", "", hash.toString(), bytes.length);
            java.nio.file.Files.write(file, bytes);
            LauncherUpdates.verify(release, file.toFile());
            bytes[0] ^= 1; java.nio.file.Files.write(file, bytes);
            try { LauncherUpdates.verify(release, file.toFile()); fail("Same-size corruption must be rejected"); }
            catch (LauncherUpdates.UpdateFailure failure) { assertTrue(failure.getMessage().contains("SHA-256")); }
            java.nio.file.Files.write(file, new byte[1]);
            try { LauncherUpdates.verify(release, file.toFile()); fail("An interrupted download cannot be offered for installation"); }
            catch (LauncherUpdates.UpdateFailure failure) { assertTrue(failure.getMessage().contains("incomplet")); }
        } finally { java.nio.file.Files.deleteIfExists(file); }
    }
    @Test public void diagnosticsExplainKnownFailuresWithoutShowingArbitraryExceptionContents() {
        assertEquals("safe reason", LauncherUpdates.failureMessage(new RuntimeException(new LauncherUpdates.UpdateFailure("safe reason")), "fallback"));
        assertTrue(LauncherUpdates.failureMessage(new java.net.SocketTimeoutException("private network details"), "fallback").contains("trop de temps"));
        assertEquals("fallback", LauncherUpdates.failureMessage(new java.io.IOException("private network details"), "fallback"));
    }
    @Test public void independentAndroidSeriesMigratesFromOldTestsAndKeepsItsUpdatesOrdered() throws Exception {
        assertTrue(LauncherUpdates.compare("1.0.0-A", "1.6.1-4") > 0);
        assertTrue(LauncherUpdates.compare("1.0.1-A", "1.0.0-A") > 0);
        assertEquals("1.0.1-A", LauncherUpdates.select(json(release("1.0.1-A", false, "arm64"), release("9.0.0", false, "arm64")), "1.0.0-A", "arm64").version);
        assertEquals("1.0.0-A", LauncherUpdates.select(json(release("1.0.0-A", false, "arm64")), "1.6.1-4", "arm64").version);
        assertNull(LauncherUpdates.select(json(release("1.1.0-beta.1-A", true, "arm64")), "1.0.0-A", "arm64"));
    }
    private JsonObject release(String version, boolean beta, String arch) {
        JsonObject r = new JsonObject(); r.addProperty("draft", false); r.addProperty("prerelease", beta); r.addProperty("tag_name", "v" + version);
        JsonObject a = new JsonObject(); String name = "Yapapouaiye-Android-" + version + "-" + arch + ".apk";
        a.addProperty("name", name); a.addProperty("size", 100);
        a.addProperty("digest", "sha256:" + "a".repeat(64));
        a.addProperty("browser_download_url", "https://github.com/YapapouaiyeDev/YapapouaiyeLauncher/releases/download/v" + version + "/" + name);
        JsonArray assets = new JsonArray(); assets.add(a); r.add("assets", assets); return r;
    }
    private String json(JsonObject... releases) { JsonArray a = new JsonArray(); for (JsonObject r : releases) a.add(r); return a.toString(); }
    @Test public void stableNeverReceivesBetaAndSelectsHighestCompatible() throws Exception {
        assertEquals("1.7.0", LauncherUpdates.select(json(release("2.0.0-beta.1", true, "arm64"), release("1.8.0", false, "x86_64"), release("1.7.0", false, "arm64")), "1.6.1-4", "arm64").version);
        assertNull(LauncherUpdates.select(json(release("1.6.1-4", false, "arm64")), "1.6.1-4", "arm64"));
        assertNull(LauncherUpdates.select(json(release("2.0.0-beta.1", false, "arm64")), "1.6.1-4", "arm64"));
    }
    @Test public void betaCanReceiveBetaOrStableAndBuildsSortNumerically() throws Exception {
        assertTrue(LauncherUpdates.compare("1.6.1-10", "1.6.1-9") > 0);
        assertTrue(LauncherUpdates.compare("1.6.1-4", "1.6.1-4-beta.10") > 0);
        assertTrue(LauncherUpdates.compare("1.6.1-4-beta.10", "1.6.1-4-beta.2") > 0);
        assertEquals("1.6.1-4", LauncherUpdates.select(json(release("1.6.1-4", false, "arm64")), "1.6.1-4-beta.1", "arm64").version);
    }
    @Test public void rejectsForeignApksMissingHashesAndDrafts() throws Exception {
        JsonObject r = release("1.7.0", false, "arm64");
        r.getAsJsonArray("assets").get(0).getAsJsonObject().addProperty("browser_download_url", "https://example.org/evil.apk");
        assertNull(LauncherUpdates.select(json(r), "1.6.1-4", "arm64"));
        r = release("1.7.0", false, "arm64"); r.getAsJsonArray("assets").get(0).getAsJsonObject().remove("digest");
        assertNull(LauncherUpdates.select(json(r), "1.6.1-4", "arm64"));
        r = release("1.7.0", false, "arm64"); r.addProperty("draft", true);
        assertNull(LauncherUpdates.select(json(r), "1.6.1-4", "arm64"));
    }
}
