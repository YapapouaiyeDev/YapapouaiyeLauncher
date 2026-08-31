package fr.yapapouaiye.nexlux.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import org.lwjgl.glfw.GLFW;

/**
 * Enregistrement des raccourcis clavier en jeu pour Lunar Client (Shift Droit, toggles rapides).
 */
public final class LunarKeyBindings {

    public static final String KEY_CATEGORY = "key.categories.lunarclient";

    public static final KeyMapping OPEN_LUNAR_MENU = new KeyMapping(
            "key.lunarclient.open_menu",
            InputConstants.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            KEY_CATEGORY
    );

    public static final KeyMapping TOGGLE_NIGHT_VISION = new KeyMapping(
            "key.lunarclient.toggle_night_vision",
            InputConstants.UNKNOWN.getValue(),
            KEY_CATEGORY
    );

    public static final KeyMapping TOGGLE_NO_FOG = new KeyMapping(
            "key.lunarclient.toggle_no_fog",
            InputConstants.UNKNOWN.getValue(),
            KEY_CATEGORY
    );

    private LunarKeyBindings() {
    }

    public static void register(RegisterKeyMappingsEvent event) {
        event.register(OPEN_LUNAR_MENU);
        event.register(TOGGLE_NIGHT_VISION);
        event.register(TOGGLE_NO_FOG);
    }
}
