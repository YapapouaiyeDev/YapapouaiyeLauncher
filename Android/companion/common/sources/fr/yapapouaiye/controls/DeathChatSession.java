/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls;

/** Owns only screen identities. Text and network requests never pass through this object. */
public final class DeathChatSession {
    public static final int OPEN_KEY = 297; // GLFW F8; Android sends FCL KEY_F8 (66), mapped in GLFW and SDL.
    public interface Host {
        Object player();
        Object connection();
        Object screen();
        boolean dead();
        boolean deathScreen(Object screen);
        Object newChat();
        void show(Object screen);
    }
    private Object player, connection, deathScreen, chatScreen;

    public boolean open(int key, Host host) {
        if(key!=OPEN_KEY || host.player()==null || host.connection()==null || !host.dead()
                || !host.deathScreen(host.screen()))return false;
        Object death=host.screen(), chat=host.newChat();
        host.show(chat);
        // A different mod can veto a screen opening. Never claim success in that case.
        if(host.screen()!=chat)return false;
        player=host.player();connection=host.connection();deathScreen=death;chatScreen=chat;
        return true;
    }
    public void tick(Host host) {
        if(chatScreen==null)return;
        if(host.player()!=player || host.connection()!=connection || !host.dead()) { clear();return; }
        if(host.screen()==chatScreen)return;
        // Vanilla normally reconstructs DeathScreen itself. Only repair a genuinely empty UI;
        // never replace a disconnect screen, another mod's screen, or an already restored death UI.
        Object restore=host.screen()==null ? deathScreen : null;
        clear();
        if(restore!=null)host.show(restore);
    }
    public boolean active() { return chatScreen!=null; }
    public void clear() { player=null;connection=null;deathScreen=null;chatScreen=null; }
}
