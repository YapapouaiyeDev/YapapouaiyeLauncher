const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const game = process.env.NEXLUX_GAME_ROOT || path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft');
const jdk = path.join(game, 'runtime/java-runtime-epsilon/bin');
const asmRoot = path.join(game, 'loader/neoforge/libraries/org/ow2/asm/asm');
const asmVersion = fs.readdirSync(asmRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
const asm = path.join(asmRoot, asmVersion, `asm-${asmVersion}.jar`);
const root = path.resolve(__dirname, '..');

test('NexLux distributed menu and HUD: icons, resize, scrolling, hit testing and snapping', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-ui-test-'));
  const sources = {
    'net/minecraft/network/chat/Component.java': 'package net.minecraft.network.chat; public interface Component { default String getString(){return "Speed";} static MutableComponent literal(String value) { return new MutableComponent(); } }',
    'net/minecraft/network/chat/MutableComponent.java': 'package net.minecraft.network.chat; public class MutableComponent implements Component {}',
    'net/minecraft/client/gui/Font.java': `package net.minecraft.client.gui; public class Font {
      public int width(String value) { return value.replaceAll("§.", "").length()*6; }
      public String plainSubstrByWidth(String value,int width) { return value.substring(0,Math.min(value.length(),Math.max(0,width/6))); }
    }`,
    'com/mojang/blaze3d/platform/Window.java': `package com.mojang.blaze3d.platform; public class Window {
      public int width=800,height=450; public int getGuiScaledWidth(){return width;} public int getGuiScaledHeight(){return height;}
    }`,
    'net/minecraft/core/BlockPos.java': 'package net.minecraft.core; public class BlockPos { public int getX(){return 206;} public int getY(){return 87;} public int getZ(){return -345;} }',
    'net/minecraft/core/Direction.java': 'package net.minecraft.core; public enum Direction { EAST }',
    'net/minecraft/core/Holder.java': 'package net.minecraft.core; public interface Holder<T> { default T value(){return (T)new net.minecraft.world.effect.MobEffect();} }',
    'net/minecraft/world/effect/MobEffect.java': 'package net.minecraft.world.effect; public class MobEffect { public net.minecraft.network.chat.Component getDisplayName(){return net.minecraft.network.chat.Component.literal("Speed");} }',
    'net/minecraft/world/effect/MobEffects.java': 'package net.minecraft.world.effect; public class MobEffects { public static final net.minecraft.core.Holder<MobEffect> NIGHT_VISION=new net.minecraft.core.Holder<>(){}, SPEED=new net.minecraft.core.Holder<>(){}, POISON=new net.minecraft.core.Holder<>(){}, WITHER=new net.minecraft.core.Holder<>(){}; }',
    'net/minecraft/world/effect/MobEffectInstance.java': `package net.minecraft.world.effect; public class MobEffectInstance {
      public int duration,amplifier; net.minecraft.core.Holder<MobEffect> effect;
      public MobEffectInstance(net.minecraft.core.Holder<MobEffect> effect,int duration,int amplifier){this(effect,duration,amplifier,false,true,true);}
      public MobEffectInstance(net.minecraft.core.Holder<MobEffect> effect,int duration,int amplifier,boolean ambient,boolean visible,boolean icon){this.duration=duration;this.amplifier=amplifier;this.effect=effect;}
      public int getDuration(){return duration;}
      public int getAmplifier(){return amplifier;} public boolean isInfiniteDuration(){return duration<0;}
      public String getDescriptionId(){return "effect.speed";} public net.minecraft.core.Holder<MobEffect> getEffect(){return effect;}
    }`,
    'net/minecraft/world/phys/Vec3.java': 'package net.minecraft.world.phys; public class Vec3 { public double horizontalDistance(){return 0;} }',
    'net/minecraft/world/entity/Entity.java': `package net.minecraft.world.entity; public class Entity {
      public Entity getVehicle(){return null;} public net.minecraft.world.phys.Vec3 getDeltaMovement(){return new net.minecraft.world.phys.Vec3();}
      public java.util.UUID getUUID(){return new java.util.UUID(0,1);}
    }`,
    'net/minecraft/client/player/LocalPlayer.java': `package net.minecraft.client.player; public class LocalPlayer extends net.minecraft.world.entity.player.Player {
      public int tickCount; public int getId(){return 1;}
      public java.util.List<net.minecraft.world.effect.MobEffectInstance> effects=new java.util.ArrayList<>();
      public java.util.Collection<net.minecraft.world.effect.MobEffectInstance> getActiveEffects(){return effects;}
      public net.minecraft.world.effect.MobEffectInstance effect;
      public net.minecraft.world.effect.MobEffectInstance getEffect(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> h){return effect;}
      public boolean hasEffect(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> h){return effect!=null;}
      public boolean addEffect(net.minecraft.world.effect.MobEffectInstance value){effect=value;return true;}
      public boolean removeEffect(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> h){effect=null;return true;}
      public net.minecraft.core.BlockPos blockPosition(){return new net.minecraft.core.BlockPos();}
      public net.minecraft.core.Direction getDirection(){return net.minecraft.core.Direction.EAST;}
    }`,
    'net/minecraft/client/gui/Gui.java': `package net.minecraft.client.gui; public class Gui {
      public void setScreen(net.minecraft.client.gui.screens.Screen screen){}
      public net.minecraft.client.gui.screens.Screen screen(){return null;}
    }`,
    'net/minecraft/client/multiplayer/ClientLevel.java': 'package net.minecraft.client.multiplayer; public class ClientLevel {}',
    'net/minecraft/client/multiplayer/PlayerInfo.java': 'package net.minecraft.client.multiplayer; public class PlayerInfo { public int getLatency(){return 44;} }',
    'net/minecraft/client/multiplayer/ClientPacketListener.java': 'package net.minecraft.client.multiplayer; public class ClientPacketListener { public PlayerInfo getPlayerInfo(java.util.UUID id){return new PlayerInfo();} }',
    'net/minecraft/client/Minecraft.java': `package net.minecraft.client; public class Minecraft {
      public Options options;
      private static final Minecraft INSTANCE=new Minecraft(); public static Minecraft getInstance(){return INSTANCE;}
      public net.minecraft.client.gui.Font font=new net.minecraft.client.gui.Font();
      public net.minecraft.client.player.LocalPlayer player=new net.minecraft.client.player.LocalPlayer();
      public net.minecraft.client.multiplayer.ClientLevel level=new net.minecraft.client.multiplayer.ClientLevel();
      public net.minecraft.client.multiplayer.ClientPacketListener getConnection(){return new net.minecraft.client.multiplayer.ClientPacketListener();}
      public int getFps(){return 9999;}
      public net.minecraft.client.gui.Gui gui=new net.minecraft.client.gui.Gui();
      public com.mojang.blaze3d.platform.Window window=new com.mojang.blaze3d.platform.Window();
      public com.mojang.blaze3d.platform.Window getWindow(){return window;}
    }`,
    'net/minecraft/client/Options.java': 'package net.minecraft.client; public class Options {}',
    'net/minecraft/client/input/MouseButtonEvent.java': 'package net.minecraft.client.input; public record MouseButtonEvent(double x,double y,int button) {}',
    'net/minecraft/client/input/KeyEvent.java': 'package net.minecraft.client.input; public record KeyEvent(int key) {}',
    'net/minecraft/client/gui/components/events/GuiEventListener.java': 'package net.minecraft.client.gui.components.events; public interface GuiEventListener {}',
    'net/minecraft/client/gui/components/EditBox.java': `package net.minecraft.client.gui.components;
      public class EditBox implements net.minecraft.client.gui.components.events.GuiEventListener {
        String value=""; boolean focused; java.util.function.Consumer<String> responder; int x,y,w,h;
        public EditBox(net.minecraft.client.gui.Font font,int x,int y,int w,int h,net.minecraft.network.chat.Component c){this.x=x;this.y=y;this.w=w;this.h=h;}
        public void setHint(net.minecraft.network.chat.Component c){} public void setMaxLength(int n){} public void setBordered(boolean b){}
        public String getValue(){return value;} public void setValue(String value){this.value=value;if(responder!=null)responder.accept(value);}
        public void setX(int x){this.x=x;} public void setY(int y){this.y=y;} public void setWidth(int width){w=width;}
        public void setResponder(java.util.function.Consumer<String> callback){responder=callback;}
        public boolean isFocused(){return focused;} public void setFocused(boolean b){focused=b;}
        public void draw(net.minecraft.client.gui.GuiGraphicsExtractor gui){gui.text(new net.minecraft.client.gui.Font(),value.isEmpty()?"Rechercher…":value,x,y,-1,false);}
      }`,
    'net/minecraft/client/gui/screens/Screen.java': `package net.minecraft.client.gui.screens;
      public class Screen implements net.minecraft.client.gui.components.events.GuiEventListener {
        public int width,height; protected net.minecraft.client.Minecraft minecraft=net.minecraft.client.Minecraft.getInstance();
        protected net.minecraft.client.gui.Font font=minecraft.font;
        java.util.List<net.minecraft.client.gui.components.EditBox> widgets=new java.util.ArrayList<>();
        public Screen(net.minecraft.network.chat.Component c){} protected void init(){widgets.clear();}
        public void start(int width,int height){this.width=width;this.height=height;init();}
        public net.minecraft.client.gui.components.events.GuiEventListener addRenderableWidget(net.minecraft.client.gui.components.events.GuiEventListener w){widgets.add((net.minecraft.client.gui.components.EditBox)w);return w;}
        public void extractBackground(net.minecraft.client.gui.GuiGraphicsExtractor g,int x,int y,float f){}
        public void extractRenderState(net.minecraft.client.gui.GuiGraphicsExtractor g,int x,int y,float f){for(var widget:widgets)widget.draw(g);}
        public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent e,boolean d){return false;}
        public boolean mouseDragged(net.minecraft.client.input.MouseButtonEvent e,double dx,double dy){return false;}
        public boolean mouseReleased(net.minecraft.client.input.MouseButtonEvent e){return false;}
        public boolean mouseScrolled(double x,double y,double dx,double dy){return false;}
        public boolean keyPressed(net.minecraft.client.input.KeyEvent e){return false;}
        public boolean isPauseScreen(){return false;} public void onClose(){} public void removed(){}
      }`,
    'fr/yapapouaiye/nexlux/client/GuiEditorScreen.java': 'package fr.yapapouaiye.nexlux.client; public class GuiEditorScreen extends net.minecraft.client.gui.screens.Screen { public GuiEditorScreen(net.minecraft.client.gui.screens.Screen parent){super(null);} }',
    'fr/yapapouaiye/nexlux/client/LunarClientEvents.java': `package fr.yapapouaiye.nexlux.client; public class LunarClientEvents {
      public static java.util.List<Long> leftClicks=new java.util.ArrayList<>(),rightClicks=new java.util.ArrayList<>();
      public static int getArmorHudBlockWidth(boolean p){return 44;} public static int getArmorHudTextWidth(boolean p){return 24;}
      public static boolean isArmorHudNumbersLeft(int x,boolean p){return false;}
      public static void renderArmorHud(net.minecraft.client.gui.GuiGraphicsExtractor g,int x,int y,boolean p){}
    }`,
    'fr/yapapouaiye/nexlux/client/ExtraHudScreen.java': 'package fr.yapapouaiye.nexlux.client; public class ExtraHudScreen extends net.minecraft.client.gui.screens.Screen { public ExtraHudScreen(net.minecraft.client.gui.screens.Screen parent,String id){super(null);} }',
    'net/minecraft/client/gui/Hud.java': `package net.minecraft.client.gui; public class Hud {
      public enum HeartType { CONTAINER,NORMAL; public net.minecraft.resources.Identifier getSprite(boolean hardcore,boolean half,boolean blink){return new net.minecraft.resources.Identifier("heart/"+(half?"half":"full"));} }
      public static net.minecraft.resources.Identifier getMobEffectSprite(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> h){return null;} }`,
    'net/minecraft/resources/Identifier.java': 'package net.minecraft.resources; public record Identifier(String value) { public String getPath(){return value.substring(value.indexOf(\':\')+1);} public static Identifier fromNamespaceAndPath(String a,String b){return new Identifier(a+":"+b);} }',
    'com/mojang/blaze3d/pipeline/RenderPipeline.java': 'package com.mojang.blaze3d.pipeline; public class RenderPipeline {}',
    'net/minecraft/client/renderer/RenderPipelines.java': 'package net.minecraft.client.renderer; public class RenderPipelines { public static final com.mojang.blaze3d.pipeline.RenderPipeline GUI_TEXTURED=new com.mojang.blaze3d.pipeline.RenderPipeline(); }',
    'net/minecraft/network/codec/StreamCodec.java': 'package net.minecraft.network.codec; public interface StreamCodec<B,V> { V decode(B b); void encode(B b,V v); }',
    'net/minecraft/network/FriendlyByteBuf.java': 'package net.minecraft.network; public class FriendlyByteBuf {}',
    'net/minecraft/network/protocol/game/ClientboundSetHealthPacket.java': 'package net.minecraft.network.protocol.game; public record ClientboundSetHealthPacket(float saturation) { public float getSaturation(){return saturation;} }',
    'org/spongepowered/asm/mixin/injection/callback/CallbackInfo.java': 'package org.spongepowered.asm.mixin.injection.callback; public class CallbackInfo {}',
    'net/minecraft/network/RegistryFriendlyByteBuf.java': `package net.minecraft.network; public class RegistryFriendlyByteBuf extends FriendlyByteBuf {
      public int id; public float value; public int readVarInt(){return id;} public float readFloat(){return value;}
      public FriendlyByteBuf writeVarInt(int v){id=v;return this;} public FriendlyByteBuf writeFloat(float v){value=v;return this;}
    }`,
    'net/minecraft/network/protocol/common/custom/CustomPacketPayload.java': `package net.minecraft.network.protocol.common.custom; public interface CustomPacketPayload {
      record Type<T extends CustomPacketPayload>(net.minecraft.resources.Identifier id){} Type<? extends CustomPacketPayload> type();
    }`,
    'net/neoforged/bus/api/SubscribeEvent.java': 'package net.neoforged.bus.api; public @interface SubscribeEvent {}',
    'net/minecraft/world/entity/player/Player.java': `package net.minecraft.world.entity.player; public class Player extends net.minecraft.world.entity.Entity {
      public float health=10,maxHealth=20; public boolean harmfulEffect;
      public net.minecraft.world.food.FoodData food=new net.minecraft.world.food.FoodData(); public net.minecraft.world.food.FoodData getFoodData(){return food;}
      public net.minecraft.world.item.ItemStack main=new net.minecraft.world.item.ItemStack(),off=new net.minecraft.world.item.ItemStack();
      public net.minecraft.world.item.ItemStack getMainHandItem(){return main;} public net.minecraft.world.item.ItemStack getOffhandItem(){return off;}
      public float getHealth(){return health;} public float getMaxHealth(){return maxHealth;}
      public boolean hasEffect(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> h){return harmfulEffect;}
    }`,
    'net/minecraft/core/component/DataComponentType.java': 'package net.minecraft.core.component; public class DataComponentType<T> {}',
    'net/minecraft/core/component/DataComponents.java': 'package net.minecraft.core.component; public class DataComponents { public static final DataComponentType<net.minecraft.world.food.FoodProperties> FOOD=new DataComponentType<>(); }',
    'net/minecraft/world/item/ItemStack.java': 'package net.minecraft.world.item; public class ItemStack { public net.minecraft.world.food.FoodProperties food; public <T> T get(net.minecraft.core.component.DataComponentType<T> type){return (T)food;} }',
    'net/minecraft/world/food/FoodProperties.java': 'package net.minecraft.world.food; public record FoodProperties(int nutrition,float saturation,boolean canAlwaysEat) {}',
    'net/minecraft/world/food/FoodData.java': 'package net.minecraft.world.food; public class FoodData { public int level=16; public float saturation=5; public int getFoodLevel(){return level;} public boolean needsFood(){return level<20;} public float getSaturationLevel(){return saturation;} }',
    'net/minecraft/server/network/ServerGamePacketListenerImpl.java': `package net.minecraft.server.network; public class ServerGamePacketListenerImpl {
      public boolean supported=true; public boolean hasChannel(net.minecraft.network.protocol.common.custom.CustomPacketPayload.Type<?> type){return supported;}
    }`,
    'net/minecraft/server/level/ServerPlayer.java': `package net.minecraft.server.level; public class ServerPlayer extends net.minecraft.world.entity.player.Player {
      public int tickCount; public net.minecraft.server.network.ServerGamePacketListenerImpl connection=new net.minecraft.server.network.ServerGamePacketListenerImpl();
      public net.minecraft.world.food.FoodData food=new net.minecraft.world.food.FoodData(); public net.minecraft.world.food.FoodData getFoodData(){return food;}
      public int getId(){return 1;}
    }`,
    'net/neoforged/neoforge/event/tick/PlayerTickEvent.java': `package net.neoforged.neoforge.event.tick; public class PlayerTickEvent {
      public static class Post { net.minecraft.world.entity.player.Player player; public Post(net.minecraft.world.entity.player.Player p){player=p;}
      public net.minecraft.world.entity.player.Player getEntity(){return player;} }
    }`,
    'net/neoforged/neoforge/network/PacketDistributor.java': `package net.neoforged.neoforge.network; public class PacketDistributor {
      public static java.util.List<net.minecraft.network.protocol.common.custom.CustomPacketPayload> sent=new java.util.ArrayList<>();
      public static void sendToPlayer(net.minecraft.server.level.ServerPlayer player,net.minecraft.network.protocol.common.custom.CustomPacketPayload payload,net.minecraft.network.protocol.common.custom.CustomPacketPayload... rest){sent.add(payload);}
    }`,
    'org/slf4j/Logger.java': 'package org.slf4j; public interface Logger { default void error(String s,Object o){} default void warn(String s,Object o){} }',
    'org/slf4j/LoggerFactory.java': 'package org.slf4j; public class LoggerFactory { public static Logger getLogger(String n){return new Logger(){};} }',
  };
  const flags = ['NightVision','NoFog','Zoom','FpsBoost','Coordinates','CpsCounter','ArmorStatus','Speed','Fps','Ping'];
  sources['fr/yapapouaiye/nexlux/client/LunarClientConfig.java'] = `package fr.yapapouaiye.nexlux.client; public class LunarClientConfig {
    static ClientMenuWindow clientMenu=new ClientMenuWindow(); public static int saves;
    public static ClientMenuWindow getClientMenu(){return clientMenu;} public static void save(){saves++;}
    static ExtraHudSettings potionTimer=new ExtraHudSettings(), saturation=new ExtraHudSettings();
    public static ExtraHudSettings getPotionTimer(){return potionTimer;} public static ExtraHudSettings getSaturation(){return saturation;}
    ${flags.map(name => `static boolean ${name}; public static boolean is${name}(){return ${name};} public static void set${name}(boolean b,boolean n){${name}=b;}`).join('\n')}
    ${['Coords','Cps','Armor','Speed','Fps','Ping'].flatMap((name,index) => ['X','Y'].map(axis => `public static int get${name}${axis}(){return ${axis === 'X' ? 8 : 8 + index * 40};}`)).join('\n')}
  }`;
  sources['net/minecraft/client/gui/GuiGraphicsExtractor.java'] = `package net.minecraft.client.gui;
    import java.awt.*;import java.awt.image.*;import java.util.*;
    public class GuiGraphicsExtractor {
      public int icons; final org.joml.Matrix3x2fStack pose=new org.joml.Matrix3x2fStack(16);
      public org.joml.Matrix3x2fStack pose(){return pose;}
      public void blitSprite(com.mojang.blaze3d.pipeline.RenderPipeline p,net.minecraft.resources.Identifier id,int x,int y,int w,int h){icons++;}
      public java.util.List<String> sprites=new ArrayList<>();
      public void blitSprite(com.mojang.blaze3d.pipeline.RenderPipeline p,net.minecraft.resources.Identifier id,int x,int y,int w,int h,int color){icons++;sprites.add(id.value());}
      public BufferedImage image; public Graphics2D canvas; public int pixels; public java.util.List<int[]> rectangles=new ArrayList<>(); public java.util.List<String> texts=new ArrayList<>();
      public GuiGraphicsExtractor(int w,int h){image=new BufferedImage(w,h,BufferedImage.TYPE_INT_ARGB);canvas=image.createGraphics();canvas.setFont(new java.awt.Font("Monospaced",0,9));}
      public void fill(int x,int y,int right,int bottom,int color){canvas.setColor(new Color(color,true));canvas.fillRect(x,y,right-x,bottom-y);pixels++;rectangles.add(new int[]{x,y,right-x,bottom-y});}
      public void outline(int x,int y,int w,int h,int color){canvas.setColor(new Color(color,true));canvas.drawRect(x,y,w-1,h-1);}
      public void text(Font f,String s,int x,int y,int color,boolean shadow){texts.add(s);canvas.setColor(new Color(color,true));canvas.drawString(s.replaceAll("§.",""),x,y+8);}
      public void centeredText(Font f,String s,int x,int y,int color){text(f,s,x-f.width(s)/2,y,color,false);}
      public void enableScissor(int x,int y,int right,int bottom){canvas.setClip(x,y,right-x,bottom-y);}
      public void disableScissor(){canvas.setClip(null);}
    }`;
  try {
    const files = Object.entries(sources).map(([name, contents]) => {
      const file = path.join(temp, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents); return file;
    });
    files.push(path.join(__dirname, 'NexLuxUiTest.java'));
    files.push(path.join(__dirname, 'NexLuxExtraHudTest.java'));
    const jar = path.join(root, 'mods/nexlux-26.2.jar');
    const gsonRoot = path.join(game, 'libraries/com/google/code/gson/gson');
    const gsonVersion = fs.readdirSync(gsonRoot).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    const gson = path.join(gsonRoot, gsonVersion, `gson-${gsonVersion}.jar`);
    const jomlRoot = path.join(game, 'libraries/org/joml/joml');
    const jomlVersion = fs.readdirSync(jomlRoot).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    const joml = path.join(jomlRoot, jomlVersion, `joml-${jomlVersion}.jar`);
    execFileSync(path.join(jdk, 'javac.exe'), ['-proc:none', '-encoding', 'UTF-8', '-cp', `${jar};${asm};${gson};${joml}`, '-d', temp, ...files], { encoding: 'utf8' });
    const result = execFileSync(path.join(jdk, 'java.exe'), ['-Xverify:all', '-Djava.awt.headless=true', '-cp', `${temp};${jar};${asm};${gson};${joml}`, 'NexLuxUiTest', jar, path.join(root, 'scratch')], { encoding: 'utf8' });
    assert.match(result, /All menu and HUD cases passed/);
    console.log(result.trim());
    const extra = execFileSync(path.join(jdk, 'java.exe'), ['-Xverify:all', '-Djava.awt.headless=true', `-Dnexlux.textureJar=${path.join(game, 'versions/26.2/26.2.jar')}`, '-cp', `${temp};${jar};${asm};${gson};${joml}`, 'NexLuxExtraHudTest', jar, temp], { encoding: 'utf8' });
    assert.match(extra, /All potion, saturation and compact HUD cases passed/);
    console.log(extra.trim());
  } finally {
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('nexlux-ui-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
