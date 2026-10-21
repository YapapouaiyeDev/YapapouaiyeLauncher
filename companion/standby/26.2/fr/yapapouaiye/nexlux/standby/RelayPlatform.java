package fr.yapapouaiye.nexlux.standby;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.players.PlayerList;
import net.minecraft.network.protocol.game.*;
import net.minecraft.world.level.gamerules.GameRules;

public final class RelayPlatform {
    private RelayPlatform() {}
    public static Identifier identifier(String value) { return Identifier.parse(value); }
    public static void releaseInput(ServerPlayer player) { player.setLastClientInput(net.minecraft.world.entity.player.Input.EMPTY); }
    public static void sendLogin(ServerPlayer player, PlayerList players, ServerLevel level) {
        var rules = level.getGameRules();
        player.connection.send(new ClientboundLoginPacket(player.getId(), level.getLevelData().isHardcore(), level.getServer().levelKeys(),
            players.getMaxPlayers(), players.getViewDistance(), players.getSimulationDistance(),
            rules.get(GameRules.REDUCED_DEBUG_INFO), !rules.get(GameRules.IMMEDIATE_RESPAWN), rules.get(GameRules.LIMITED_CRAFTING),
            player.createCommonSpawnInfo(level), level.getServer().usesAuthentication(), level.getServer().enforceSecureProfile()));
    }
    public static void sendRecipes(ServerPlayer player, MinecraftServer server) {
        player.connection.send(new ClientboundSetHeldSlotPacket(player.getInventory().getSelectedSlot()));
        var recipes = server.getRecipeManager();
        player.connection.send(new ClientboundUpdateRecipesPacket(recipes.getSynchronizedItemProperties(), recipes.getSynchronizedStonecutterRecipes()));
    }
}
