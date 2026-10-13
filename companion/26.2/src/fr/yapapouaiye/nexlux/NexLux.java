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
        NexLuxConfig.load();
        NexLuxCore.init();
        NexLuxEvents.register();
        if (FMLEnvironment.getDist() == Dist.CLIENT) {
            LunarClientInit.init(modEventBus);
        }
    }
}

