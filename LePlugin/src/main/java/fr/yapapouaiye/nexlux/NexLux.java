package fr.yapapouaiye.nexlux;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

/**
 * Point d'entrée du mod NexLux.
 * <p>
 * NexLux est un « plugin » serveur pour NeoForge qui expose facilement les
 * informations du serveur (joueurs en ligne, liste des joueurs, TPS, statut…)
 * via une API HTTP JSON et des commandes en jeu.
 */
@Mod(NexLux.MOD_ID)
public final class NexLux {

    public static final String MOD_ID = "nexlux";
    public static final String MOD_NAME = "NexLux";
    public static final String MOD_VERSION = "1.1.0";

    public NexLux(IEventBus modEventBus) {
        // Charge la configuration avant tout (le dossier config/ existe déjà à ce stade).
        NexLuxConfig.load();

        // Initialise le cœur du mod (API HTTP, TPS, snapshots) et branche les événements serveur.
        NexLuxCore.init();
        NexLuxEvents.register();

        // Initialise les fonctionnalités Lunar Client (Menu Shift Droit, Night Vision, NoFog) côté client
        if (net.neoforged.fml.loading.FMLEnvironment.dist == net.neoforged.api.distmarker.Dist.CLIENT) {
            fr.yapapouaiye.nexlux.client.LunarClientInit.init(modEventBus);
        }
    }
}
