package fr.yapapouaiye.nexlux.standby;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;

public final class StandbyPlatform {
    private StandbyPlatform() {}
    public static Screen getScreen() { return Minecraft.getInstance().gui.screen(); }
    public static void setScreen(Screen screen) { Minecraft.getInstance().gui.setScreen(screen); }
    public static void pauseSounds() { Minecraft.getInstance().getSoundManager().pauseAllExcept(); }
    public static void focus() {
        long window = Minecraft.getInstance().getWindow().handle();
        org.lwjgl.glfw.GLFW.glfwShowWindow(window); org.lwjgl.glfw.GLFW.glfwFocusWindow(window);
    }
}
