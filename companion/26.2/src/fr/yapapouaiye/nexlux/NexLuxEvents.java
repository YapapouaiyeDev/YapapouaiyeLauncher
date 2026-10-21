/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.mojang.brigadier.CommandDispatcher
 *  net.minecraft.commands.CommandSourceStack
 *  net.neoforged.bus.api.SubscribeEvent
 *  net.neoforged.neoforge.common.NeoForge
 *  net.neoforged.neoforge.event.RegisterCommandsEvent
 *  net.neoforged.neoforge.event.entity.player.PlayerEvent$PlayerLoggedInEvent
 *  net.neoforged.neoforge.event.entity.player.PlayerEvent$PlayerLoggedOutEvent
 *  net.neoforged.neoforge.event.server.ServerStartedEvent
 *  net.neoforged.neoforge.event.server.ServerStoppedEvent
 *  net.neoforged.neoforge.event.tick.ServerTickEvent$Post
 */
package fr.yapapouaiye.nexlux;

import com.mojang.brigadier.CommandDispatcher;
import fr.yapapouaiye.nexlux.NexLuxCore;
import fr.yapapouaiye.nexlux.command.NexLuxCommands;
import net.minecraft.commands.CommandSourceStack;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

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
        NexLuxCommands.register((CommandDispatcher<CommandSourceStack>)event.getDispatcher());
    }
}

