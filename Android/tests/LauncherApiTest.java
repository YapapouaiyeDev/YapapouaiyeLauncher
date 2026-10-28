/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.google.gson.*;
import java.io.IOException;
import java.io.File;
import java.nio.file.Files;
import java.util.zip.*;
import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class LauncherApiTest {
    private JsonObject server(String id, String loader, int order) {
        JsonObject s = new JsonObject();
        s.addProperty("id", id); s.addProperty("name", "Serveur " + id); s.addProperty("host", "example.test");
        s.addProperty("gameVersion", "1.21.1"); s.addProperty("defaultLoader", loader); s.addProperty("gamePort", 25565);
        s.addProperty("pingPort", 12345); s.addProperty("sortOrder", order); s.addProperty("enabled", true);
        return s;
    }
    private List<LauncherApi.Server> parse(JsonObject... values) throws IOException {
        JsonObject root = new JsonObject(); root.addProperty("ok", true);
        JsonArray servers = new JsonArray(); for (JsonObject s : values) servers.add(s);
        root.add("servers", servers); return LauncherApi.parseCatalog(root.toString());
    }
    private void rejects(JsonObject... values) throws Exception {
        try { parse(values); fail("Untrusted catalog must be rejected"); } catch (IOException expected) { }
    }
    @Test public void listsAllLoadersFiltersDisabledAndUsesGamePort() throws Exception {
        JsonObject disabled = server("hidden", "neoforge", 0); disabled.addProperty("enabled", false);
        List<LauncherApi.Server> list = parse(server("neo", "neoforge", 4), server("fabric", "fabric", 2), disabled,
            server("forge", "forge", 3), server("plain", "vanilla", 1));
        assertEquals(Arrays.asList("plain", "fabric", "forge", "neo"), Arrays.asList(list.get(0).id, list.get(1).id, list.get(2).id, list.get(3).id));
        assertEquals("example.test:25565", list.get(0).address());
    }
    @Test public void rejectsTraversalDuplicatesAndMalformedFields() throws Exception {
        rejects(server("../escape", "fabric", 0)); rejects(server("dup", "fabric", 0), server("DUP", "fabric", 1));
        JsonObject s = server("test", "fabric", 0); s.addProperty("gamePort", 0); rejects(s);
        s.addProperty("gamePort", 1.5); rejects(s); s.addProperty("gamePort", "25565"); rejects(s);
        rejects(server("test", "unknown", 0));
        s = server("test", "fabric", 0); s.addProperty("host", "https://example.test/path"); rejects(s);
        s = server("test", "fabric", 0); s.addProperty("enabled", "false"); rejects(s);
    }
    @Test public void validatesAccessRequirementsAndGameChanges() throws Exception {
        JsonObject s = server("test", "fabric", 0); s.addProperty("codesRequired", true); rejects(s);
        s.addProperty("codesCount", 3); LauncherApi.Server before = parse(s).get(0);
        assertTrue(before.codesRequired); assertEquals(3, before.codesCount);
        s.addProperty("defaultLoader", "neoforge"); assertFalse(before.sameGame(parse(s).get(0)));
        s.addProperty("defaultLoader", "fabric"); s.addProperty("gameVersion", "26.2"); assertFalse(before.sameGame(parse(s).get(0)));
        s.addProperty("gameVersion", "1.21.1"); s.addProperty("host", "::1"); assertTrue(before.sameGame(parse(s).get(0)));
        assertEquals("[::1]:25565", parse(s).get(0).address());
    }
    @Test public void canonicalizesLegacyEndpointsWithoutDuplicatingGamePort() throws Exception {
        JsonObject s = server("test", "vanilla", 0);
        for (String host : new String[]{"37.27.49.96:57542", "37.27.49.96:25565", "37.27.49.96"}) {
            s.addProperty("host", host); s.addProperty("gamePort", 57542);
            assertEquals("37.27.49.96:57542", parse(s).get(0).address());
        }
        s.addProperty("host", "example.test:1234");
        assertEquals("example.test:57542", parse(s).get(0).address());
        for (String host : new String[]{"2001:db8::1", "[2001:db8::1]", "[2001:db8::1]:1234"}) {
            s.addProperty("host", host);
            assertEquals("[2001:db8::1]:57542", parse(s).get(0).address());
        }
    }
    @Test public void rejectsMalformedEndpointLiteralsAndEmbeddedPorts() throws Exception {
        for (String host : new String[]{"", ":1234", "example.test:", "example.test:0", "example.test:65536",
                "example.test:no", "[example.test]:1234", "[::1", "[::1]oops", "[::1]:0", ":::1", "host::1", "a/b", "a@b"}) {
            JsonObject s = server("test", "vanilla", 0); s.addProperty("host", host); rejects(s);
        }
    }
    @Test public void refusesWrongLoaderInsteadOfLaunchingWithoutServerMods() throws Exception {
        File jar = File.createTempFile("loader-check", ".jar");
        try {
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(jar.toPath()))) {
                zip.putNextEntry(new ZipEntry("META-INF/neoforge.mods.toml")); zip.write(new byte[]{1}); zip.closeEntry();
            }
            LauncherApi.validateLoader(List.of(jar), "neoforge");
            assertThrows(IOException.class, () -> LauncherApi.validateLoader(List.of(jar), "fabric"));
            assertThrows(IOException.class, () -> LauncherApi.validateLoader(List.of(jar), "vanilla"));
            LauncherApi.validateLoader(Collections.emptyList(), "vanilla");
        } finally { Files.deleteIfExists(jar.toPath()); }
    }
}
