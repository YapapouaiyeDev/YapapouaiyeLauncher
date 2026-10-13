/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.mojang.blaze3d.platform.InputConstants
 *  com.mojang.blaze3d.platform.InputConstants$Type
 *  net.minecraft.client.KeyMapping
 *  net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent
 */
package fr.yapapouaiye.nexlux.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;

public final class LunarKeyBindings {
    private static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(net.minecraft.resources.Identifier.fromNamespaceAndPath("nexlux", "controls"));
    public static final KeyMapping.Category KEY_CATEGORY = CATEGORY;
    public static final KeyMapping OPEN_LUNAR_MENU = new KeyMapping("key.yapapouaiye.open_menu", InputConstants.Type.KEYSYM, 344, CATEGORY);
    public static final KeyMapping KEY_ZOOM = new KeyMapping("key.yapapouaiye.zoom", InputConstants.Type.KEYSYM, 67, CATEGORY);
    public static final KeyMapping TOGGLE_FULLBRIGHT = new KeyMapping("key.yapapouaiye.toggle_fullbright", InputConstants.UNKNOWN.getValue(), CATEGORY);
    public static final KeyMapping TOGGLE_NIGHT_VISION = new KeyMapping("key.yapapouaiye.toggle_night_vision", InputConstants.UNKNOWN.getValue(), CATEGORY);
    public static final KeyMapping TOGGLE_NO_FOG = new KeyMapping("key.yapapouaiye.toggle_no_fog", InputConstants.UNKNOWN.getValue(), CATEGORY);

    private LunarKeyBindings() {
    }

    public static void register(RegisterKeyMappingsEvent event) {
        event.register(OPEN_LUNAR_MENU);
        event.register(KEY_ZOOM);
        event.register(TOGGLE_FULLBRIGHT);
        event.register(TOGGLE_NIGHT_VISION);
        event.register(TOGGLE_NO_FOG);
    }
}

