package fr.yapapouaiye.nexlux;

import fr.yapapouaiye.nexlux.command.NexLuxCommands;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

/**
 * Enregistre les écouteurs d'événements serveur (bus de jeu) de NexLux.
 * Tous ces événements sont reçus sur le thread principal du serveur.
 */
public final class NexLuxEvents {

    private NexLuxEvents() {
    }

    public static void register() {
        NeoForge.EVENT_BUS.addListener(NexLuxEvents::onServerStarted);
        NeoForge.EVENT_BUS.addListener(NexLuxEvents::onServerStopped);
        NeoForge.EVENT_BUS.addListener(NexLuxEvents::onServerTick);
        NeoForge.EVENT_BUS.addListener(NexLuxEvents::onPlayerLoggedIn);
        NeoForge.EVENT_BUS.addListener(NexLuxEvents::onPlayerLoggedOut);
        NeoForge.EVENT_BUS.addListener(NexLuxEvents::onRegisterCommands);
    }

    @SubscribeEvent
    private static void onServerStarted(ServerStartedEvent event) {
        NexLuxCore.get().onServerStarted(event.getServer());
    }

    @SubscribeEvent
    private static void onServerStopped(ServerStoppedEvent event) {
        NexLuxCore.get().onServerStopped();
    }

    @SubscribeEvent
    private static void onServerTick(ServerTickEvent.Post event) {
        NexLuxCore.get().onTick(event.getServer());
    }

    @SubscribeEvent
    private static void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        NexLuxCore.get().onPlayersChanged();
    }

    @SubscribeEvent
    private static void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        NexLuxCore.get().onPlayersChanged();
    }

    @SubscribeEvent
    private static void onRegisterCommands(RegisterCommandsEvent event) {
        NexLuxCommands.register(event.getDispatcher());
    }
}
