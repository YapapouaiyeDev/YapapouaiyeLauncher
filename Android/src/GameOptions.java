/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public final class GameOptions {
    /** A user-selected preset; never replace unrelated keys, controls or mod options. */
    public static void apply(Path directory, String preset) throws IOException {
        if (!Arrays.asList("custom", "balanced", "performance").contains(preset)) throw new IOException("Profil graphique invalide.");
        Path file = directory.resolve("options.txt");
        List<String> lines = Files.exists(file) ? Files.readAllLines(file, StandardCharsets.UTF_8) : new ArrayList<>(Collections.singletonList("lang:fr_fr"));
        Map<String, String> options = new LinkedHashMap<>();
        for(String line:lines)if(line.startsWith("gamma:")) {
            try {double gamma=Double.parseDouble(line.substring(6));if(!Double.isFinite(gamma)||gamma<0||gamma>1)options.put("gamma","1.0");}
            catch(NumberFormatException ignored){options.put("gamma","1.0");}
        }
        if(preset.equals("custom") && Files.exists(file) && options.isEmpty())return;
        boolean fast = preset.equals("performance");
        if (!preset.equals("custom")) {
        options.put("renderDistance", fast ? "6" : "10"); options.put("simulationDistance", "5");
        options.put("maxFps", "60"); options.put("graphicsMode", fast ? "0" : "1");
        options.put("particles", fast ? "2" : "1"); options.put("entityShadows", fast ? "false" : "true");
        }
        List<String> result = new ArrayList<>();
        for (String line : lines) {
            int colon = line.indexOf(':');
            if (colon < 0 || !options.containsKey(line.substring(0, colon))) result.add(line);
        }
        options.forEach((key, value) -> result.add(key + ":" + value));
        Files.createDirectories(directory);
        if (Files.exists(file) && !Files.exists(directory.resolve("options-before-yapapouaiye.txt")))
            Files.copy(file, directory.resolve("options-before-yapapouaiye.txt"));
        Path pending = directory.resolve("options.txt.yapa-tmp");
        Files.write(pending, result, StandardCharsets.UTF_8);
        Files.move(pending, file, StandardCopyOption.REPLACE_EXISTING);
    }
}
