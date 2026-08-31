package fr.yapapouaiye.nexlux.client;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.common.NeoForge;

/**
 * Initialisation des modules Lunar Client côté client uniquement.
 */
public final class LunarClientInit {

    private LunarClientInit() {
    }

    public static void init(IEventBus modEventBus) {
        // Enregistre les raccourcis sur le bus du mod
        modEventBus.addListener(LunarKeyBindings::register);

        // Enregistre les écouteurs de tick et de brouillard sur le bus NeoForge
        NeoForge.EVENT_BUS.register(LunarClientEvents.class);

        // Initialise la configuration client
        LunarClientConfig.init(FMLPaths.GAMEDIR.get());
    }
}
