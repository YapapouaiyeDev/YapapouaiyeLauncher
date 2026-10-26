/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.neoforged.api.distmarker.Dist
 *  net.neoforged.bus.api.IEventBus
 *  net.neoforged.fml.common.Mod
 *  net.neoforged.fml.loading.FMLEnvironment
 */
package fr.yapapouaiye.nexlux;

import fr.yapapouaiye.nexlux.NexLuxConfig;
import fr.yapapouaiye.nexlux.NexLuxCore;
import fr.yapapouaiye.nexlux.NexLuxEvents;
import fr.yapapouaiye.nexlux.client.LunarClientInit;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;

@Mod(value="nexlux")
public final class NexLux {
    public static final String MOD_ID = "nexlux";
    public static final String MOD_NAME = "NexLux";
    public static final String MOD_VERSION = "26.2";

    public NexLux(IEventBus modEventBus) {
        modEventBus.addListener(net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent.class, event ->
            event.registrar("1").optional().playToClient(
                fr.yapapouaiye.nexlux.network.SaturationPayload.TYPE,
                fr.yapapouaiye.nexlux.network.SaturationPayload.CODEC,
                (message, context) -> fr.yapapouaiye.nexlux.client.SaturationState.receive(message)));
        net.neoforged.neoforge.common.NeoForge.EVENT_BUS.register(fr.yapapouaiye.nexlux.network.SaturationSync.class);
        NexLuxConfig.load();
        NexLuxCore.init();
        NexLuxEvents.register();
        if (FMLEnvironment.getDist() == Dist.CLIENT) {
            LunarClientInit.init(modEventBus);
        }
    }
}

