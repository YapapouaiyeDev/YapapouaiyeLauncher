// Execute the actual distributed standby classes against a minimal client fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const game = process.env.NEXLUX_GAME_ROOT || path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft');
const jdk = process.env.NEXLUX_JDK || path.join(game, 'runtime/java-runtime-epsilon/bin');

const sources = {
  "fr/yapapouaiye/nexlux/standby/StandbyNetworkClient.java": "package fr.yapapouaiye.nexlux.standby; public class StandbyNetworkClient { public static String status() { return null; } public static boolean frozen() { return false; } public static void enter() {} public static void resume() {} public static void tick() {} }",
  'fr/yapapouaiye/nexlux/standby/RelayClient.java': 'package fr.yapapouaiye.nexlux.standby; public class RelayClient { public static boolean available() { return false; } public static void detach() {} }',
  'net/neoforged/api/distmarker/Dist.java': 'package net.neoforged.api.distmarker; public enum Dist { CLIENT, DEDICATED_SERVER }',
  'net/neoforged/fml/common/EventBusSubscriber.java': 'package net.neoforged.fml.common; public @interface EventBusSubscriber { String modid(); net.neoforged.api.distmarker.Dist[] value(); }',
  'net/neoforged/bus/api/SubscribeEvent.java': 'package net.neoforged.bus.api; public @interface SubscribeEvent {}',
  'net/minecraft/network/chat/Component.java': 'package net.minecraft.network.chat; public interface Component { public static MutableComponent literal(String s) { return new MutableComponent(); } }',
  'net/minecraft/network/chat/MutableComponent.java': 'package net.minecraft.network.chat; public class MutableComponent implements Component {}',
  'net/minecraft/client/gui/Font.java': 'package net.minecraft.client.gui; public class Font {}',
  'net/minecraft/client/gui/components/events/GuiEventListener.java': 'package net.minecraft.client.gui.components.events; public interface GuiEventListener {}',
  'net/minecraft/client/gui/components/Button.java': `package net.minecraft.client.gui.components;
    import net.minecraft.network.chat.Component;
    public class Button implements net.minecraft.client.gui.components.events.GuiEventListener {
      public interface OnPress { void onPress(Button b); }
      public OnPress action; public void press() { action.onPress(this); }
      public static Builder builder(Component c, OnPress p) { Builder b=new Builder(); b.action=p; return b; }
      public static class Builder { OnPress action; public Builder bounds(int x,int y,int w,int h) { return this; }
        public Button build() { Button b=new Button(); b.action=action; return b; } }
    }`,
  'net/minecraft/client/gui/screens/Screen.java': `package net.minecraft.client.gui.screens;
    import net.minecraft.client.gui.*; import net.minecraft.network.chat.Component;
    import net.minecraft.client.gui.components.events.GuiEventListener;
    public class Screen {
      public int width=320,height=200; protected Font font=new Font(); protected Component title;
      public java.util.List<GuiEventListener> widgets=new java.util.ArrayList<>();
      public Screen(Component c) { title=c; } protected void init() {} public void start() { init(); }
      protected <T extends GuiEventListener> T addRenderableWidget(T widget) { widgets.add(widget); return widget; }
      public void render(GuiGraphics g,int x,int y,float t) {} public void renderBackground(GuiGraphics g,int x,int y,float t) {}
      public void extractRenderState(GuiGraphicsExtractor g,int x,int y,float t) {} public void extractBackground(GuiGraphicsExtractor g,int x,int y,float t) {}
      public boolean isPauseScreen() { return true; } public void onClose() {} public void removed() {}
    }`,
  'net/minecraft/client/gui/screens/PauseScreen.java': 'package net.minecraft.client.gui.screens; public class PauseScreen extends Screen { public PauseScreen() { super(null); } }',
  'net/minecraft/client/multiplayer/ClientLevel.java': 'package net.minecraft.client.multiplayer; public class ClientLevel {}',
  'net/minecraft/client/multiplayer/ClientPacketListener.java': 'package net.minecraft.client.multiplayer; public class ClientPacketListener {}',
  'net/minecraft/client/player/LocalPlayer.java': 'package net.minecraft.client.player; public class LocalPlayer {}',
  'net/minecraft/sounds/SoundSource.java': 'package net.minecraft.sounds; public enum SoundSource { MASTER }',
  'net/minecraft/client/resources/sounds/SoundInstance.java': 'package net.minecraft.client.resources.sounds; public interface SoundInstance {}',
  'net/minecraft/client/sounds/SoundManager.java': `package net.minecraft.client.sounds; public class SoundManager {
    public int paused,resumed; public void pause() { paused++; }
    public void pauseAllExcept(net.minecraft.sounds.SoundSource... sources) { paused++; } public void resume() { resumed++; }
  }`,
  'net/minecraft/client/particle/ParticleEngine.java': 'package net.minecraft.client.particle; public class ParticleEngine implements fr.yapapouaiye.nexlux.standby.mixin.StandbyParticlesMixin { public int cleared; public void nexlux$clearParticles() { cleared++; } }',
  'net/minecraft/client/KeyMapping.java': 'package net.minecraft.client; public class KeyMapping { public static int releases; public static void releaseAll() { releases++; } }',
  'net/minecraft/client/gui/Gui.java': 'package net.minecraft.client.gui; public class Gui { public net.minecraft.client.gui.screens.Screen screen() { return net.minecraft.client.Minecraft.getInstance().screen; } public void setScreen(net.minecraft.client.gui.screens.Screen s) { net.minecraft.client.Minecraft.getInstance().setScreen(s); } }',
  'net/minecraft/client/Minecraft.java': `package net.minecraft.client;
    import net.minecraft.client.gui.screens.Screen;
    public class Minecraft {
      static final Minecraft INSTANCE=new Minecraft(); public static Minecraft getInstance() { return INSTANCE; }
      public net.minecraft.client.multiplayer.ClientLevel level;
      public net.minecraft.client.player.LocalPlayer player;
      public net.minecraft.client.multiplayer.ClientPacketListener connection;
      public Screen screen; public boolean local;
      public final net.minecraft.client.particle.ParticleEngine particleEngine=new net.minecraft.client.particle.ParticleEngine();
      public net.minecraft.client.gui.Gui gui=new net.minecraft.client.gui.Gui();
      public final net.minecraft.client.sounds.SoundManager sounds=new net.minecraft.client.sounds.SoundManager();
      public boolean hasSingleplayerServer() { return local; }
      public net.minecraft.client.multiplayer.ClientPacketListener getConnection() { return connection; }
      public net.minecraft.client.sounds.SoundManager getSoundManager() { return sounds; }
      public void setScreen(Screen s) { if(screen!=null)screen.removed(); screen=s; if(s!=null)s.start(); }
    }`,
  'net/neoforged/neoforge/client/event/ClientTickEvent.java': 'package net.neoforged.neoforge.client.event; public class ClientTickEvent { public static class Post extends ClientTickEvent {} }',
  'net/neoforged/neoforge/client/event/ScreenEvent.java': `package net.neoforged.neoforge.client.event;
    import net.minecraft.client.gui.screens.Screen; import net.minecraft.client.gui.components.events.GuiEventListener;
    public class ScreenEvent { Screen screen; public Screen getScreen() { return screen; }
      public static class Init extends ScreenEvent { public java.util.List<GuiEventListener> widgets=new java.util.ArrayList<>();
        public void addListener(GuiEventListener w) { widgets.add(w); }
        public static class Post extends Init { public Post(Screen s) { screen=s; } } }
    }`,
  'net/neoforged/neoforge/client/event/sound/PlaySoundEvent.java': `package net.neoforged.neoforge.client.event.sound;
    import net.minecraft.client.resources.sounds.SoundInstance;
    public class PlaySoundEvent { public SoundInstance sound=new SoundInstance() {}; public void setSound(SoundInstance s) { sound=s; } }
  `,
};
for (const name of ['GuiGraphics', 'GuiGraphicsExtractor']) {
  sources[`net/minecraft/client/gui/${name}.java`] = `package net.minecraft.client.gui;
    public class ${name} { public int fills,texts;
      public void fill(int x,int y,int w,int h,int c) { fills++; }
      public void drawCenteredString(Font f,net.minecraft.network.chat.Component c,int x,int y,int col) { texts++; }
      public void drawCenteredString(Font f,String c,int x,int y,int col) { texts++; }
      public void centeredText(Font f,net.minecraft.network.chat.Component c,int x,int y,int col) { texts++; }
      public void centeredText(Font f,String c,int x,int y,int col) { texts++; }
    }`;
}
sources['StandbyTest.java'] = `
  import fr.yapapouaiye.nexlux.standby.*;
  import net.minecraft.client.*;
  import net.minecraft.client.gui.components.Button;
  import net.minecraft.client.gui.screens.*;
  import net.neoforged.neoforge.client.event.*;
  import net.neoforged.neoforge.client.event.sound.PlaySoundEvent;
  import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
  public class StandbyTest {
    static class RenderProbe extends fr.yapapouaiye.nexlux.standby.mixin.WorldRenderMixin {}
    static class FrameProbe extends fr.yapapouaiye.nexlux.standby.mixin.FramerateMixin {}
    static void check(boolean b,String s) { if(!b)throw new AssertionError(s); }
    static void tick() { StandbyClient.onTick(new ClientTickEvent.Post()); }
    static boolean render(boolean input) throws Exception {
      var method=RenderProbe.class.getSuperclass().getDeclaredMethod("nexlux$renderWorld",boolean.class);
      method.setAccessible(true); return (boolean)method.invoke(new RenderProbe(),input);
    }
    static int fps() throws Exception { return fps(165); }
    static int fps(int normal) throws Exception {
      var result=new CallbackInfoReturnable<Integer>("limit",true,Integer.valueOf(normal));
      var method=FrameProbe.class.getSuperclass().getDeclaredMethod("nexlux$standbyFrameLimit",CallbackInfoReturnable.class);
      method.setAccessible(true); method.invoke(new FrameProbe(),result); return result.getReturnValue();
    }
    public static void main(String[] args) throws Exception {
      Minecraft mc=Minecraft.getInstance(); tick(); check(!StandbyClient.isActive(),"must wait for a server");
      mc.level=new net.minecraft.client.multiplayer.ClientLevel(); mc.player=new net.minecraft.client.player.LocalPlayer();
      mc.connection=new net.minecraft.client.multiplayer.ClientPacketListener(); var connection=mc.connection;
      mc.local=true; tick(); check(!StandbyClient.isActive(),"no standby in solo"); mc.local=false;
      mc.setScreen(new Screen(null)); tick(); check(!StandbyClient.isActive(),"must wait for loading screen");
      mc.setScreen(null); tick(); check(StandbyClient.isActive(),"additional account auto standby after join");
      check(mc.particleEngine.cleared==1,"release old particles once on entry");
      var cleanup=StandbyClient.class.getDeclaredField("memoryCleanupTicks"); cleanup.setAccessible(true);
      check(cleanup.getInt(null)==40,"delay memory collection until the last frame is released");
      for(int i=0;i<40;i++) tick();
      check(cleanup.getInt(null)==0,"memory cleanup runs once per standby");
      tick(); check(cleanup.getInt(null)==0,"no repeated full GC during standby");
      check(!mc.screen.isPauseScreen(),"do not pause game ticks"); check(!render(true),"skip world rendering");
      check(!render(false),"preserve false render flag"); check(fps()==5,"standby frame cap");
      check(fps(1)==1,"preserve a lower native minimized-window frame cap");
      check(mc.sounds.paused==1 && KeyMapping.releases==1,"pause sound and release movement keys");
      var sound=new PlaySoundEvent(); StandbyClient.onSound(sound); check(sound.sound==null,"new sounds muted");
      ((Button)mc.screen.widgets.get(0)).press();
      check(!StandbyClient.isActive() && mc.screen==null,"resume button returns to gameplay");
      check(mc.sounds.resumed==1 && render(true) && fps()==165,"restore sound, world and original FPS cap");
      sound=new PlaySoundEvent(); StandbyClient.onSound(sound); check(sound.sound!=null,"sound playback restored");
      tick(); check(!StandbyClient.isActive(),"do not auto standby again after manual resume");
      var event=new ScreenEvent.Init.Post(new PauseScreen()); StandbyClient.onScreenInit(event);
      check(event.widgets.size()==1,"pause menu standby button"); ((Button)event.widgets.get(0)).press();
      check(StandbyClient.isActive(),"manual standby");
      var screen=mc.screen;
      if(args[0].equals("26.2")) {
        var gui=new net.minecraft.client.gui.GuiGraphicsExtractor(); screen.extractRenderState(gui,0,0,0);
        check(gui.fills==1 && gui.texts==3,"standby screen renders without a world");
      } else {
        var gui=new net.minecraft.client.gui.GuiGraphics(); screen.render(gui,0,0,0);
        check(gui.fills==1 && gui.texts==3,"standby screen renders without a world");
      }
      mc.setScreen(new Screen(null)); tick(); check(!StandbyClient.isActive(),"other screens must exit standby");
      mc.setScreen(new StandbyScreen()); check(StandbyClient.isActive(),"reenter standby");
      mc.screen.onClose(); check(!StandbyClient.isActive(),"escape resumes");
      check(cleanup.getInt(null)==0,"resume cancels pending memory collection");
      check(mc.connection==connection,"keep the same connection throughout standby and resume");
      mc.setScreen(new StandbyScreen()); mc.connection=null; mc.level=null; mc.player=null; tick();
      check(!StandbyClient.isActive() && mc.screen==null,"disconnect clears standby");
      check(mc.sounds.paused==mc.sounds.resumed,"sound always restored");
      System.out.println("PASS " + args[0] + ": auto join, menu, resume, sound, FPS, rendering and disconnect");
    }
  }
`;

for (const [version, file, clientJar, mixinVersion] of [
  ['1.21.1', 'nexlux-1.1.0.jar', 'net/neoforged/neoforge/21.1.264/neoforge-21.1.264-client.jar', '0.16.4+mixin.0.8.7'],
  ['26.2', 'nexlux-26.2.jar', 'net/neoforged/minecraft-client-patched/26.2.0.93/minecraft-client-patched-26.2.0.93.jar', '0.17.4+mixin.0.8.7'],
]) test(`distributed standby ${version}: reversible lifecycle and exact render/FPS targets`, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-standby-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const jar = path.join(root, 'mods', file);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(jar)).digest('hex'),
    crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'src/assets', file))).digest('hex'));
  let mixin = path.join(game, `loader/neoforge/libraries/net/fabricmc/sponge-mixin/${mixinVersion}/sponge-mixin-${mixinVersion}.jar`);
  if (!fs.existsSync(mixin)) mixin = path.join(game, 'loader/neoforge/libraries/net/fabricmc/sponge-mixin/0.17.4+mixin.0.8.7/sponge-mixin-0.17.4+mixin.0.8.7.jar');
  const files = [];
  for (const [name, content] of Object.entries(sources)) {
    const file = path.join(temp, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); files.push(file);
  }
  const classes = path.join(temp, 'classes');
  fs.mkdirSync(classes);
  const argsFile = path.join(temp, 'javac.args');
  fs.writeFileSync(argsFile, ['-proc:none', '-encoding', 'UTF-8', '-classpath', `"${[jar, mixin].join(path.delimiter).replaceAll('\\', '/')}"`, '-d', `"${classes.replaceAll('\\', '/')}"`, ...files.map(f => `"${f.replaceAll('\\', '/')}"`)].join('\n'));
  execFileSync(path.join(jdk, 'javac.exe'), [`@${argsFile}`], { stdio: 'pipe' });
  const result = execFileSync(path.join(jdk, 'java.exe'), ['-Dnexlux.standbyOnJoin=true', '-cp', [classes, jar, mixin].join(path.delimiter), 'StandbyTest', version], { encoding: 'utf8' });
  assert.match(result, /PASS/);
  const target = path.join(game, 'loader/neoforge/libraries', clientJar);
  if (!fs.existsSync(target)) { t.diagnostic('Client API JAR absent: distributed bytecode lifecycle tested, native render target check unavailable.'); return; }
  const renderer = execFileSync(path.join(jdk, 'javap.exe'), ['-s', '-classpath', target, 'net.minecraft.client.renderer.GameRenderer'], { encoding: 'utf8' });
  assert.ok(renderer.includes('(Lnet/minecraft/client/DeltaTracker;Z)V'));
  if (version === '26.2') assert.match(renderer, /void extract\(net.minecraft.client.DeltaTracker, boolean\)/);
  const frameClass = version === '26.2' ? 'com.mojang.blaze3d.platform.FramerateLimitTracker' : 'net.minecraft.client.Minecraft';
  const frameTarget = execFileSync(path.join(jdk, 'javap.exe'), ['-private', '-classpath', target, frameClass], { encoding: 'utf8' });
  assert.match(frameTarget, /int getFramerateLimit\(\)/);
});
