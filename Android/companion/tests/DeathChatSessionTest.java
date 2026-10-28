/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls;

/** Exercises the same receiver/state controller shipped in both mod JARs, without a server. */
public final class DeathChatSessionTest {
    private static int checks;
    private static final class Death {}
    private static final class Chat {}
    private static final class FakeHost implements DeathChatSession.Host {
        Object player=new Object(), connection=new Object(), screen=new Death();
        boolean dead=true, veto;
        int shows, chats;
        public Object player() { return player; }
        public Object connection() { return connection; }
        public Object screen() { return screen; }
        public boolean dead() { return dead; }
        public boolean deathScreen(Object screen) { return screen instanceof Death; }
        public Object newChat() { chats++;return new Chat(); }
        public void show(Object value) { shows++;if(!veto)screen=value; }
    }
    private static void check(boolean value,String message) { checks++;if(!value)throw new AssertionError(message); }
    private static void open(DeathChatSession session,FakeHost host) {
        check(session.open(297,host),"F8 on DeathScreen did not open chat");
        check(host.screen instanceof Chat && session.active(),"Chat was not tracked");
    }
    public static void main(String[] args) {
        DeathChatSession session=new DeathChatSession();FakeHost host=new FakeHost();
        check(!session.open(84,host) && host.shows==0,"Ordinary T was intercepted");
        check(!session.open(302,host) && host.shows==0,"Unmapped legacy F13 was intercepted");
        host.screen=new Object();check(!session.open(297,host),"F8 changed another screen");
        host.screen=new Death();host.dead=false;check(!session.open(297,host),"Alive player opened death chat");
        host.dead=true;host.connection=null;check(!session.open(297,host),"Disconnected player opened death chat");
        host.connection=new Object();host.player=null;check(!session.open(297,host),"Missing player opened chat");
        host.player=new Object();Object originalDeath=host.screen;open(session,host);
        check(!session.open(297,host) && host.chats==1,"Repeated F8 reopened the chat");
        session.tick(host);check(session.active() && host.shows==1,"An open chat was replaced");
        host.screen=null;session.tick(host);
        check(host.screen==originalDeath && !session.active() && host.shows==2,"Closing chat while dead did not restore death UI");
        open(session,host);Death vanillaDeath=new Death();host.screen=vanillaDeath;int before=host.shows;session.tick(host);
        check(host.screen==vanillaDeath && host.shows==before && !session.active(),"Vanilla restored death UI was replaced");
        open(session,host);host.dead=false;host.screen=null;before=host.shows;session.tick(host);
        check(host.screen==null && host.shows==before && !session.active(),"Respawn restored a stale death UI");
        host.dead=true;host.screen=new Death();open(session,host);host.connection=null;host.screen=null;session.tick(host);
        check(host.screen==null && !session.active(),"Logout restored a stale death UI");
        host.connection=new Object();host.screen=new Death();open(session,host);host.player=new Object();host.screen=null;session.tick(host);
        check(host.screen==null && !session.active(),"Replacement player inherited an old death screen");
        host.screen=new Death();open(session,host);Object disconnectScreen=new Object();host.screen=disconnectScreen;before=host.shows;session.tick(host);
        check(host.screen==disconnectScreen && host.shows==before && !session.active(),"An unrelated screen was overwritten");
        host.screen=new Death();host.veto=true;check(!session.open(297,host) && !session.active(),"Vetoed chat opening was marked active");
        System.out.println("DeathChatSession: "+checks+" checks passed");
    }
}
