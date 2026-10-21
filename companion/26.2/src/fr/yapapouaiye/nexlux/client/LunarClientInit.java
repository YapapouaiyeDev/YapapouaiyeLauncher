/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.resources.Identifier
 *  net.neoforged.bus.api.IEventBus
 *  net.neoforged.fml.loading.FMLPaths
 *  net.neoforged.neoforge.client.event.RegisterGuiLayersEvent
 *  net.neoforged.neoforge.common.NeoForge
 */
package fr.yapapouaiye.nexlux.client;

import fr.yapapouaiye.nexlux.client.LunarClientConfig;
import fr.yapapouaiye.nexlux.client.LunarClientEvents;
import fr.yapapouaiye.nexlux.client.LunarKeyBindings;
import net.minecraft.resources.Identifier;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.client.event.RegisterGuiLayersEvent;
import net.neoforged.neoforge.common.NeoForge;

public final class LunarClientInit {
    private LunarClientInit() {
    }

    public static void init(IEventBus modEventBus) {
        modEventBus.addListener(LunarKeyBindings::register);
        modEventBus.addListener(RegisterGuiLayersEvent.class, event -> event.registerAboveAll(Identifier.fromNamespaceAndPath((String)"nexlux", (String)"hud"), (guiGraphics, deltaTracker) -> LunarClientEvents.renderHud(guiGraphics)));
        NeoForge.EVENT_BUS.register(LunarClientEvents.class);
        LunarClientConfig.init(FMLPaths.GAMEDIR.get());
    }
}

