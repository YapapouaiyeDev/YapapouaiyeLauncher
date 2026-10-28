/* SPDX-License-Identifier: MIT */
package net.minecraft.client.gui.screens;

/** Test-only receiver; never included in a distributable mod JAR. */
public class ChatScreen {
    public static int historyAdds, globalDraftChanges, removals, scrollResets;
    public static boolean received;
    private final boolean modern;
    protected final FakeMinecraft minecraft=new FakeMinecraft();
    protected EditBox input=new EditBox();
    public ChatScreen(String initial) { modern=false; }
    public ChatScreen(String initial,boolean draft) { modern=true; }
    public void handleChatInput(String text,boolean addToHistory) {
        received=text!=null && !text.isEmpty();if(addToHistory)historyAdds++;
    }
    public void removed() { removals++;scrollResets++;if(modern)globalDraftChanges++; }
    public void typeForTest() { input.setValue("temporary input"); }
    public String fieldForTest() { return input.value; }
    public static final class EditBox { String value="";public void setValue(String text) { value=text; } }
    public static final class FakeMinecraft { public final Gui gui=new Gui(); }
    public static final class Gui { public final Hud hud=new Hud(); }
    public static final class Hud { public Chat getChat() { return new Chat(); } }
    public static final class Chat { public void resetChatScroll() { scrollResets++; } }
}
