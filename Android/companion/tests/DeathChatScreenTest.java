/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls;

import net.minecraft.client.gui.screens.ChatScreen;

/** Executes each actual version-specific login screen against a test-only vanilla receiver. */
public final class DeathChatScreenTest {
    public static void main(String[] args) {
        DeathChatScreen screen=new DeathChatScreen();
        screen.handleChatInput("temporary command",true);
        if(!ChatScreen.received || ChatScreen.historyAdds!=0)throw new AssertionError("Input was lost or added to history");
        screen.typeForTest();screen.removed();
        if(!screen.fieldForTest().isEmpty())throw new AssertionError("Temporary field survived closing");
        if(ChatScreen.globalDraftChanges!=0)throw new AssertionError("The user's existing global draft was changed");
        if(ChatScreen.scrollResets!=1)throw new AssertionError("Transient chat scroll was not reset");
        System.out.println("DeathChatScreen "+args[0]+": input, history, field cleanup and global draft checks passed");
    }
}
