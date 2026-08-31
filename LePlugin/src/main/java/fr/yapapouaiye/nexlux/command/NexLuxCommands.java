package fr.yapapouaiye.nexlux.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.context.CommandContext;
import fr.yapapouaiye.nexlux.NexLux;
import fr.yapapouaiye.nexlux.NexLuxConfig;
import fr.yapapouaiye.nexlux.NexLuxCore;
import fr.yapapouaiye.nexlux.data.ServerStatus;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;

import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Commandes en jeu : {@code /nexlux}.
 * <ul>
 *   <li>{@code /nexlux status} — résumé du serveur (joueurs, TPS, uptime)</li>
 *   <li>{@code /nexlux players} — liste des joueurs connectés</li>
 *   <li>{@code /nexlux api} — adresse et état de l'API HTTP</li>
 *   <li>{@code /nexlux reload} — recharge la configuration (op uniquement)</li>
 * </ul>
 */
public final class NexLuxCommands {

    private NexLuxCommands() {
    }

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("nexlux")
                .then(Commands.literal("status").executes(NexLuxCommands::status))
                .then(Commands.literal("players").executes(NexLuxCommands::players))
                .then(Commands.literal("api").executes(NexLuxCommands::api))
                .then(Commands.literal("reload")
                        .requires(s -> s.hasPermission(2))
                        .executes(NexLuxCommands::reload))
                .executes(NexLuxCommands::help));
    }

    private static int help(CommandContext<CommandSourceStack> ctx) {
        ctx.getSource().sendSuccess(() -> Component.literal("§6§lNexLux §r§7v" + NexLux.MOD_VERSION
                + " — §f/nexlux status§7, §f/nexlux players§7, §f/nexlux api§7, §f/nexlux reload§7 (op)"), false);
        return 1;
    }

    private static int status(CommandContext<CommandSourceStack> ctx) {
        ServerStatus s = NexLuxCore.get().getStatus();
        if (s == null) {
            ctx.getSource().sendSuccess(() -> Component.literal("§cLe serveur n'est pas encore prêt."), false);
            return 0;
        }
        ctx.getSource().sendSuccess(() -> Component.literal("§6§lNexLux §r§8| §7" + s.onlinePlayers() + "§f/§7" + s.maxPlayers()
                + " joueurs en ligne §8· §7TPS §f" + format(s.tps1m())
                + " §8· §7MSPT §f" + format(s.mspt())
                + " §8· §7Uptime §f" + formatUptime(s.uptimeSeconds())
                + " §8· §7Mode §f" + (s.onlineMode() ? "en ligne" : "hors-ligne")
                + " §8· §7Whitelist §f" + (s.whitelist() ? "activée" : "désactivée")), false);
        return 1;
    }

    private static int players(CommandContext<CommandSourceStack> ctx) {
        ServerStatus s = NexLuxCore.get().getStatus();
        if (s == null) {
            ctx.getSource().sendSuccess(() -> Component.literal("§cLe serveur n'est pas encore prêt."), false);
            return 0;
        }
        String list = s.players().isEmpty()
                ? "§7Aucun joueur connecté."
                : "§f" + s.players().stream().map(p -> p.name()).collect(Collectors.joining("§7, §f"));
        ctx.getSource().sendSuccess(() -> Component.literal("§6§lNexLux §r§8| §7Joueurs (" + s.onlinePlayers() + ") : " + list), false);
        return 1;
    }

    private static int api(CommandContext<CommandSourceStack> ctx) {
        NexLuxConfig.ApiConfig cfg = NexLuxConfig.get().api;
        boolean running = NexLuxCore.get() != null && NexLuxCore.get().getServer() != null;
        String state = NexLuxCore.get() != null && NexLuxCore.get().isApiRunning()
                ? "§aactive" : "§carrêtée / désactivée";
        ctx.getSource().sendSuccess(() -> Component.literal("§6§lNexLux §r§8| §7API HTTP §f" + state
                + " §8· §7http://" + cfg.host + ":" + cfg.port
                + " §8· §7Jeton §f" + (cfg.token == null || cfg.token.isEmpty() ? "aucun" : "requis")
                + " §8· §7Serveur §f" + (running ? "démarré" : "arrêté")), false);
        return 1;
    }

    private static int reload(CommandContext<CommandSourceStack> ctx) {
        NexLuxCore.get().reload();
        ctx.getSource().sendSuccess(() -> Component.literal("§aConfiguration NexLux rechargée."), true);
        return 1;
    }

    private static String format(double v) {
        return String.format(Locale.ROOT, "%.2f", v);
    }

    private static String formatUptime(long seconds) {
        long h = seconds / 3600;
        long m = (seconds % 3600) / 60;
        long s = seconds % 60;
        if (h > 0) {
            return h + "h " + m + "min";
        }
        if (m > 0) {
            return m + "min " + s + "s";
        }
        return s + "s";
    }
}
