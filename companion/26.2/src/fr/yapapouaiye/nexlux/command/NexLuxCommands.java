/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.mojang.brigadier.CommandDispatcher
 *  com.mojang.brigadier.builder.LiteralArgumentBuilder
 *  com.mojang.brigadier.context.CommandContext
 *  net.minecraft.commands.CommandSourceStack
 *  net.minecraft.commands.Commands
 *  net.minecraft.network.chat.Component
 */
package fr.yapapouaiye.nexlux.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import fr.yapapouaiye.nexlux.NexLuxConfig;
import fr.yapapouaiye.nexlux.NexLuxCore;
import fr.yapapouaiye.nexlux.data.ServerStatus;
import java.util.Locale;
import java.util.stream.Collectors;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;

public final class NexLuxCommands {
    private NexLuxCommands() {
    }

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register((LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)Commands.literal((String)"nexlux").then(Commands.literal((String)"status").executes(NexLuxCommands::status))).then(Commands.literal((String)"players").executes(NexLuxCommands::players))).then(Commands.literal((String)"api").executes(NexLuxCommands::api))).then(((LiteralArgumentBuilder)Commands.literal((String)"reload").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))).executes(NexLuxCommands::reload))).executes(NexLuxCommands::help));
    }

    private static int help(CommandContext<CommandSourceStack> ctx) {
        ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)"\u00a76\u00a7lNexLux \u00a7r\u00a77v1.1.0 \u2014 \u00a7f/nexlux status\u00a77, \u00a7f/nexlux players\u00a77, \u00a7f/nexlux api\u00a77, \u00a7f/nexlux reload\u00a77 (op)"), false);
        return 1;
    }

    private static int status(CommandContext<CommandSourceStack> ctx) {
        ServerStatus s = NexLuxCore.get().getStatus();
        if (s == null) {
            ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)"\u00a7cLe serveur n'est pas encore pr\u00eat."), false);
            return 0;
        }
        ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)("\u00a76\u00a7lNexLux \u00a7r\u00a78| \u00a77" + s.onlinePlayers() + "\u00a7f/\u00a77" + s.maxPlayers() + " joueurs en ligne \u00a78\u00b7 \u00a77TPS \u00a7f" + NexLuxCommands.format(s.tps1m()) + " \u00a78\u00b7 \u00a77MSPT \u00a7f" + NexLuxCommands.format(s.mspt()) + " \u00a78\u00b7 \u00a77Uptime \u00a7f" + NexLuxCommands.formatUptime(s.uptimeSeconds()) + " \u00a78\u00b7 \u00a77Mode \u00a7f" + (s.onlineMode() ? "en ligne" : "hors-ligne") + " \u00a78\u00b7 \u00a77Whitelist \u00a7f" + (s.whitelist() ? "activ\u00e9e" : "d\u00e9sactiv\u00e9e"))), false);
        return 1;
    }

    private static int players(CommandContext<CommandSourceStack> ctx) {
        ServerStatus s = NexLuxCore.get().getStatus();
        if (s == null) {
            ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)"\u00a7cLe serveur n'est pas encore pr\u00eat."), false);
            return 0;
        }
        String list = s.players().isEmpty() ? "\u00a77Aucun joueur connect\u00e9." : "\u00a7f" + s.players().stream().map(p -> p.name()).collect(Collectors.joining("\u00a77, \u00a7f"));
        ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)("\u00a76\u00a7lNexLux \u00a7r\u00a78| \u00a77Joueurs (" + s.onlinePlayers() + ") : " + list)), false);
        return 1;
    }

    private static int api(CommandContext<CommandSourceStack> ctx) {
        NexLuxConfig.ApiConfig cfg = NexLuxConfig.get().api;
        boolean running = NexLuxCore.get() != null && NexLuxCore.get().getServer() != null;
        String state = NexLuxCore.get() != null && NexLuxCore.get().isApiRunning() ? "\u00a7aactive" : "\u00a7carr\u00eat\u00e9e / d\u00e9sactiv\u00e9e";
        ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)("\u00a76\u00a7lNexLux \u00a7r\u00a78| \u00a77API HTTP \u00a7f" + state + " \u00a78\u00b7 \u00a77http://" + cfg.host + ":" + cfg.port + " \u00a78\u00b7 \u00a77Jeton \u00a7f" + (cfg.token == null || cfg.token.isEmpty() ? "aucun" : "requis") + " \u00a78\u00b7 \u00a77Serveur \u00a7f" + (running ? "d\u00e9marr\u00e9" : "arr\u00eat\u00e9"))), false);
        return 1;
    }

    private static int reload(CommandContext<CommandSourceStack> ctx) {
        NexLuxCore.get().reload();
        ((CommandSourceStack)ctx.getSource()).sendSuccess(() -> Component.literal((String)"\u00a7aConfiguration NexLux recharg\u00e9e."), true);
        return 1;
    }

    private static String format(double v) {
        return String.format(Locale.ROOT, "%.2f", v);
    }

    private static String formatUptime(long seconds) {
        long h = seconds / 3600L;
        long m = seconds % 3600L / 60L;
        long s = seconds % 60L;
        if (h > 0L) {
            return h + "h " + m + "min";
        }
        if (m > 0L) {
            return m + "min " + s + "s";
        }
        return s + "s";
    }
}

