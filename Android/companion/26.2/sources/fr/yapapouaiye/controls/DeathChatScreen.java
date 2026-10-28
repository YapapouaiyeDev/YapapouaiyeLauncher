/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls;

import net.minecraft.client.gui.screens.ChatScreen;

/** Allows server login while dead. Vanilla handles signed chat/commands and the return screen. */
final class DeathChatScreen extends ChatScreen {
    DeathChatScreen() { super("",false); }
    @Override public void handleChatInput(String text, boolean addToHistory) { super.handleChatInput(text,false); }
    @Override public void removed() {
        if(input!=null)input.setValue("");
        // ChatScreen.removed also saves/discards the global draft. Preserve the user's draft;
        // this temporary login screen owns only its own input field and the transient scroll.
        minecraft.gui.hud.getChat().resetChatScroll();
    }
}
