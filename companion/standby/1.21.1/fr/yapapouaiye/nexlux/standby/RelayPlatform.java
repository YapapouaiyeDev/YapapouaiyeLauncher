package fr.yapapouaiye.nexlux.standby;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.players.PlayerList;
import net.minecraft.network.protocol.game.*;
import net.minecraft.world.level.GameRules;

public final class RelayPlatform {
    private RelayPlatform() {}
    public static ResourceLocation identifier(String value) { return ResourceLocation.parse(value); }
    public static void releaseInput(ServerPlayer player) { player.setPlayerInput(0, 0, false, false); }
    public static void sendLogin(ServerPlayer player, PlayerList players, ServerLevel level) {
        var rules = level.getGameRules();
        player.connection.send(new ClientboundLoginPacket(player.getId(), level.getLevelData().isHardcore(), level.getServer().levelKeys(),
            players.getMaxPlayers(), players.getViewDistance(), players.getSimulationDistance(),
            rules.getBoolean(GameRules.RULE_REDUCEDDEBUGINFO), !rules.getBoolean(GameRules.RULE_DO_IMMEDIATE_RESPAWN), rules.getBoolean(GameRules.RULE_LIMITED_CRAFTING),
            player.createCommonSpawnInfo(level), level.getServer().enforceSecureProfile()));
    }
    public static void sendRecipes(ServerPlayer player, MinecraftServer server) {
        player.connection.send(new ClientboundSetCarriedItemPacket(player.getInventory().selected));
        player.connection.send(new ClientboundUpdateRecipesPacket(server.getRecipeManager().getOrderedRecipes()));
    }
}
