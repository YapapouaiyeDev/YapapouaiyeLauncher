import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import fr.yapapouaiye.nexlux.client.*;
import fr.yapapouaiye.nexlux.network.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.effect.*;
import net.neoforged.neoforge.network.PacketDistributor;

/** Runs distributed module, sync, editor and persistence code against isolated game services. */
public class NexLuxExtraHudTest {
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static GuiGraphicsExtractor draw(String id, boolean preview) {
        var gui = new GuiGraphicsExtractor(800,450);
        ExtraHud.render(gui,id,preview);
        check(gui.pose().equals(new org.joml.Matrix3x2f()), "renderer restores pose stack");
        return gui;
    }
    static class Loader extends ClassLoader {
        final String jar;
        final boolean fullConfig;
        Loader(String jar) { this(jar,true); }
        Loader(String jar,boolean fullConfig) { this.jar=jar; this.fullConfig=fullConfig; }
        @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            boolean config=fullConfig && name.startsWith("fr.yapapouaiye.nexlux.client.LunarClientConfig");
            boolean editor=name.equals("fr.yapapouaiye.nexlux.client.GuiEditorScreen");
            boolean parsers=name.equals("fr.yapapouaiye.nexlux.client.ExtraHudScreen");
            if (!config && !editor && !parsers) return super.loadClass(name,resolve);
            Class<?> known=findLoadedClass(name); if(known!=null)return known;
            try(var zip=new ZipFile(jar);var in=zip.getInputStream(zip.getEntry(name.replace('.','/')+".class"))) {
                var writer=new ClassWriter(0);
                new ClassReader(in.readAllBytes()).accept(new ClassVisitor(Opcodes.ASM9,writer) {
                    public MethodVisitor visitMethod(int a,String n,String d,String s,String[] e) {
                        if(parsers && !n.equals("parseScale") && !n.equals("parseColor"))return null;
                        if((config && (n.equals("applyFullBright") || n.equals("applyNightVision") || n.equals("sendActionNotification"))) || editor && n.equals("playClickSound")) {
                            var m=super.visitMethod(a,n,d,s,e);m.visitCode();m.visitInsn(Opcodes.RETURN);m.visitMaxs(0,3);m.visitEnd();return null;
                        }
                        return super.visitMethod(a,n,d,s,e);
                    }
                },0);
                byte[] bytes=writer.toByteArray(); return defineClass(name,bytes,0,bytes.length);
            }catch(Exception e){throw new ClassNotFoundException(name,e);}
        }
    }
    public static void main(String[] args) throws Exception {
        var mc=Minecraft.getInstance();
        mc.window.width=800;mc.window.height=450;
        var potions=LunarClientConfig.getPotionTimer(); var saturation=LunarClientConfig.getSaturation();
        potions.enabled=true;saturation.enabled=true;saturation.y=180;
        check(draw("potions",false).texts.isEmpty(),"no fabricated effects in game");
        check(draw("potions",true).texts.getFirst().contains("II"),"editor-only example identifies potion level");
        var speed=new MobEffectInstance(MobEffects.SPEED,1220,2);
        mc.player.effects.add(speed);mc.player.tickCount++;
        var gui=draw("potions",false);
        check(gui.icons==1 && gui.texts.equals(List.of("Speed III  01:01")),"real effect, icon, roman level and MM:SS");
        speed.duration=1200;mc.player.tickCount++;
        check(draw("potions",false).texts.getFirst().endsWith("01:00"),"duration ticks update automatically");
        potions.icons=false;potions.names=false;potions.levels=false;
        check(draw("potions",false).icons==0 && draw("potions",false).texts.equals(List.of("01:00")),"information independently configurable");
        speed.duration=-1;mc.player.tickCount++;
        check(draw("potions",false).texts.equals(List.of("∞")),"infinite effects have no fabricated countdown");
        speed.duration=0;mc.player.tickCount++;
        gui=draw("potions",false);check(gui.texts.isEmpty() && gui.rectangles.isEmpty(),"expired effect and background vanish together");
        potions.enabled=false;check(draw("potions",true).texts.size()==1 && draw("potions",false).texts.isEmpty(),"independent toggle preserves editor access");
        check(ExtraHud.time(1).equals("00:01") && ExtraHud.time(1200).equals("01:00"),"partial second rounded up");
        check(ExtraHud.roman(4).equals("IV") && ExtraHud.roman(9).equals("IX") && ExtraHud.roman(256).equals("CCLVI"),"full amplifier range");
        var naturalVision=new MobEffectInstance(MobEffects.NIGHT_VISION,1200,0);
        mc.player.effect=naturalVision;ClientNightVision.update(false);
        check(mc.player.effect==naturalVision,"normal night vision potion is not removed when client toggle is off");
        ClientNightVision.update(true);check(mc.player.effect==naturalVision,"normal night vision duration is not overwritten");
        mc.player.effect=null;ClientNightVision.update(true);check(mc.player.effect!=null,"synthetic night vision still works");
        ClientNightVision.update(false);check(mc.player.effect==null,"only synthetic night vision removed");

        SaturationState.clear();
        check(draw("saturation",false).texts.isEmpty(),"no detached saturation panel");
        SaturationState.receive(new SaturationPayload(1,13.5f));
        check(SaturationState.value()==13.5f,"authoritative packet accepted");
        check(draw("saturation",false).texts.isEmpty(),"saturation belongs to native food icons");
        gui=draw("saturation",false);
        check(gui.rectangles.isEmpty(),"no extra saturation surface");
        SaturationState.receive(new SaturationPayload(99,3));check(SaturationState.value()==13.5f,"wrong player packet ignored");
        SaturationState.receive(new SaturationPayload(1,Float.NaN));check(SaturationState.value()==13.5f,"invalid packet ignored");
        mc.player=new net.minecraft.client.player.LocalPlayer();
        check(Float.isNaN(SaturationState.value()),"respawn and reconnect invalidate old value");
        SaturationState.receive(new SaturationPayload(1,0));check(SaturationState.value()==0,"real zero preserved");
        SaturationState.receive(new SaturationPayload(1,20));check(SaturationState.value()==20,"real maximum preserved");
        var stale=SaturationState.class.getDeclaredField("received");stale.setAccessible(true);stale.setLong(null,System.nanoTime()-11_000_000_000L);
        check(Float.isNaN(SaturationState.value()),"missing heartbeat expires stale value");
        // Run the distributed packet hook; no local FoodData default is used as a server value.
        var hookType=fr.yapapouaiye.nexlux.standby.mixin.SaturationPacketMixin.class;
        var hook=new fr.yapapouaiye.nexlux.standby.mixin.SaturationPacketMixin() {};
        var receive=hookType.getDeclaredMethod("nexlux$receiveSaturation",net.minecraft.network.protocol.game.ClientboundSetHealthPacket.class,
            org.spongepowered.asm.mixin.injection.callback.CallbackInfo.class);
        receive.setAccessible(true);
        receive.invoke(hook,new net.minecraft.network.protocol.game.ClientboundSetHealthPacket(7.25f),null);
        check(SaturationState.value()==7.25f && SaturationState.approximate(),"vanilla server value used when custom channel unavailable");
        check(SaturationState.approximate(),"vanilla fallback retains approximate status");
        SaturationState.receiveVanilla(Float.NaN);SaturationState.receiveVanilla(-1);SaturationState.receiveVanilla(21);
        check(SaturationState.value()==7.25f,"invalid vanilla values ignored");
        SaturationState.receive(new SaturationPayload(1,7.25f));
        check(!SaturationState.approximate(),"live custom channel takes precedence at equal value");
        stale.setLong(null,System.nanoTime()-11_000_000_000L);
        check(SaturationState.approximate(),"expired custom channel falls back to last vanilla packet");
        SaturationState.receiveVanilla(0);check(SaturationState.value()==0,"vanilla zero not replaced with default");
        SaturationState.receiveVanilla(20);check(SaturationState.value()==20,"vanilla maximum accepted");
        mc.player=new net.minecraft.client.player.LocalPlayer();
        check(Float.isNaN(SaturationState.value()) && !SaturationState.approximate(),"respawn invalidates both sources");
        SaturationState.receiveVanilla(5);SaturationState.clear();
        check(Float.isNaN(SaturationState.value()),"logout clears vanilla fallback too");
        try(var zip=new ZipFile(args[0])) {
            String mixins=new String(zip.getInputStream(zip.getEntry("nexlux-standby.mixins.json")).readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            check(mixins.contains("\"SaturationPacketMixin\""),"packet hook is registered in distributed JAR");
            check(mixins.contains("\"SaturationHudMixin\""),"native HUD hooks are registered in distributed JAR");
        }
        saturation.number=false;saturation.background=false;
        check(draw("saturation",false).texts.isEmpty(),"bar-only transparent mode");
        saturation.number=true;saturation.background=true;

        var player=new net.minecraft.server.level.ServerPlayer();
        var tick=new net.neoforged.neoforge.event.tick.PlayerTickEvent.Post(player);
        player.connection.supported=false;SaturationSync.tick(tick);check(PacketDistributor.sent.isEmpty(),"server sends nothing to unsupported client");
        player.connection.supported=true;SaturationSync.tick(tick);check(PacketDistributor.sent.size()==1,"first authoritative value sent");
        for(int i=1;i<100;i++){player.tickCount=i;SaturationSync.tick(tick);}
        check(PacketDistributor.sent.size()==1,"unchanged value does not flood network");
        player.tickCount=100;SaturationSync.tick(tick);check(PacketDistributor.sent.size()==2,"heartbeat sent every five seconds");
        player.food.saturation=7.25f;SaturationSync.tick(tick);
        check(((SaturationPayload)PacketDistributor.sent.getLast()).saturation()==7.25f,"fractional server changes sent immediately");
        player=new net.minecraft.server.level.ServerPlayer();player.food.saturation=2;
        SaturationSync.tick(new net.neoforged.neoforge.event.tick.PlayerTickEvent.Post(player));
        check(((SaturationPayload)PacketDistributor.sent.getLast()).saturation()==2,"new server player receives first value after respawn");
        var buffer=new net.minecraft.network.RegistryFriendlyByteBuf();
        SaturationPayload.CODEC.encode(buffer,new SaturationPayload(1,7.25f));
        check(SaturationPayload.CODEC.decode(buffer).saturation()==7.25f,"packet codec roundtrip");
        buffer.value=Float.POSITIVE_INFINITY;
        try{SaturationPayload.CODEC.decode(buffer);throw new AssertionError("invalid codec value accepted");}catch(IllegalArgumentException expected){}

        for(int[] viewport:new int[][]{{800,450},{320,180},{120,100},{960,540}}) {
            mc.window.width=viewport[0];mc.window.height=viewport[1];
            for(String id:new String[]{"potions","saturation"}) {
                ExtraHud.settings(id).scale=3;ExtraHud.settings(id).x=9999;ExtraHud.settings(id).y=-9999;
                ExtraHud.fit(id);
                check(HudMetrics.x(id)>=4 && HudMetrics.y(id)>=4,"reflow keeps HUD inside left/top");
                check(HudMetrics.x(id)+HudMetrics.width(id)<=viewport[0]-4 && HudMetrics.y(id)+HudMetrics.height(id)<=viewport[1]-4,"size and reflow fit small window");
            }
        }
        mc.window.width=800;mc.window.height=450;
        potions.scale=1;saturation.scale=1;potions.x=300;potions.y=80;saturation.x=180;saturation.y=180;
        var loader=new Loader(args[0]);
        var editorType=new Loader(args[0],false).loadClass("fr.yapapouaiye.nexlux.client.GuiEditorScreen");
        var editor=(net.minecraft.client.gui.screens.Screen)editorType.getConstructor(net.minecraft.client.gui.screens.Screen.class).newInstance((Object)null);
        editor.start(800,450);
        int clickX=HudMetrics.x("potions")+5,clickY=HudMetrics.y("potions")+5;
        editor.mouseClicked(new net.minecraft.client.input.MouseButtonEvent(clickX,clickY,0),false);
        int targetX=400;
        editor.mouseDragged(new net.minecraft.client.input.MouseButtonEvent(targetX+7,225,0),0,0);
        editor.mouseReleased(new net.minecraft.client.input.MouseButtonEvent(targetX+7,225,0));
        check(potions.x==targetX+2,"actual editor still moves potion HUD");
        check(saturation.x==180 && saturation.y==180,"integrated saturation has no draggable panel");
        savedScaleChecks(editor,potions,saturation);
        overlayChecks();
        renderSaturationHalves(Path.of(args[0]).getParent().getParent().resolve("scratch/nexlux-saturation-halves.png"));
        int[] free=HudLayout.avoidOverlap(50,50,120,80,800,450,new int[][]{{50,50,100,100}});
        check(free[0]>=154 || free[1]>=154 || free[0]+120<=46 || free[1]+80<=46,"resizing finds nearest non-overlapping location");
        int saved=LunarClientConfig.saves;editor.removed();check(LunarClientConfig.saves>saved,"interrupted editor saves settings");
        for(String id:new String[]{"fps","ping","speed","cps"}) {
            int width=HudMetrics.width(id);
            check(width==mc.font.width(HudMetrics.counterText(id))+8,"gray margin removed for "+id);
            check(HudLayout.snap(100+width-20+2,20,new int[]{100},new int[]{width},800)==100+width-20,"compact background still snaps");
        }

        var parsers=loader.loadClass("fr.yapapouaiye.nexlux.client.ExtraHudScreen");
        var parseScale=parsers.getMethod("parseScale",String.class);
        for(String invalid:new String[]{"","-","NaN","Infinity","0","99999","abc"}) check(parseScale.invoke(null,invalid)==null,"invalid/incomplete scale rejected: "+invalid);
        check(parseScale.invoke(null,"125").equals(1.25f),"scale accepts percentage");
        check(parsers.getMethod("parseColor",String.class,boolean.class).invoke(null,"00000000",true).equals(0),"transparent panel is valid");
        check(parsers.getMethod("parseColor",String.class,boolean.class).invoke(null,"",true)==null,"empty color cannot corrupt settings");

        var config=loader.loadClass("fr.yapapouaiye.nexlux.client.LunarClientConfig");
        Path game=Path.of(args[1],"config-roundtrip");Files.createDirectories(game);
        config.getMethod("init",Path.class).invoke(null,game);
        ExtraHudSettings first=(ExtraHudSettings)config.getMethod("getPotionTimer").invoke(null);
        first.enabled=true;first.x=123;first.y=77;first.scale=1.75f;first.icons=false;first.background=false;first.textColor=0xFF336699;
        ExtraHudSettings second=(ExtraHudSettings)config.getMethod("getSaturation").invoke(null);
        second.enabled=true;second.x=390;second.number=false;second.barColor=0xFF00DD88;
        config.getMethod("save").invoke(null);
        check(Files.readString(game.resolve("config/yapapouaiye_client.json")).equals(Files.readString(game.resolve("config/lunar_client.json"))),"both historical config files retain new modules");
        first.x=999;second.enabled=false;
        config.getMethod("init",Path.class).invoke(null,game);
        first=(ExtraHudSettings)config.getMethod("getPotionTimer").invoke(null);second=(ExtraHudSettings)config.getMethod("getSaturation").invoke(null);
        check(first.enabled && first.x==123 && first.y==77 && first.scale==1.75f && !first.icons && !first.background && first.textColor==0xFF336699,"real client config reload preserves potion options");
        check(second.enabled && second.x==390 && !second.number && second.barColor==0xFF00DD88,"real client config reload preserves saturation options independently");
        Files.writeString(game.resolve("config/yapapouaiye_client.json"),"{\"potionTimer\":null,\"saturation\":{\"scale\":0}} ");
        config.getMethod("init",Path.class).invoke(null,game);
        check(config.getMethod("getPotionTimer").invoke(null)!=null,"missing/null module restored safely");
        check(((ExtraHudSettings)config.getMethod("getSaturation").invoke(null)).scale==0.5f,"invalid persisted scale sanitized");
        System.out.println("All potion, saturation and compact HUD cases passed");
    }
    static void overlayChecks() throws Exception {
        var mc=Minecraft.getInstance();
        mc.player=new net.minecraft.client.player.LocalPlayer();
        var player=mc.player;
        var settings=LunarClientConfig.getSaturation();
        settings.enabled=true;settings.bar=true;settings.icons=true;settings.levels=true;
        SaturationState.receive(new SaturationPayload(1,5));
        var gui=new GuiGraphicsExtractor(800,450);
        SaturationOverlay.food(gui,player,0,700,400);
        check(!gui.rectangles.isEmpty() && gui.icons==0,"current saturation draws only outline pixels");
        for(var r:gui.rectangles) check(r[0]>=700 && r[1]>=400 && r[0]+r[2]<=709 && r[1]+r[3]<=409,
            "outline never escapes native nine-pixel icon");
        int full=gui.rectangles.size();
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,2,700,400);
        check(gui.rectangles.size()>0 && gui.rectangles.size()<full,"fractional saturation draws a partial contour");
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,3,700,400);
        check(gui.rectangles.isEmpty(),"no contour beyond actual saturation");
        SaturationState.receive(new SaturationPayload(1,0));
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,0,700,400);
        check(gui.rectangles.isEmpty(),"zero saturation adds no outline");
        player.main.food=new net.minecraft.world.food.FoodProperties(6,7.2f,false);
        check(SaturationOverlay.projectedSaturation(19,19,player.main.food)==20,"food prediction capped at food level and twenty");
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,9,700,400);
        check(gui.icons==1,"held food previews newly filled food icons");
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.heart(gui,player,6,100,400,false);
        check(gui.icons==1,"held food previews recoverable missing hearts");
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.heart(gui,player,1,100,400,false);
        check(gui.icons==0,"preview does not cover existing health");
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.heart(gui,player,10,100,400,false);
        check(gui.icons==0,"preview does not cover absorption hearts");
        player.food.level=20;
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.heart(gui,player,6,100,400,false);
        check(gui.icons==0,"inedible held food does not promise recovery");
        player.food.level=16;player.main.food=null;player.off.food=new net.minecraft.world.food.FoodProperties(6,7.2f,false);
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.heart(gui,player,6,100,400,true);
        check(gui.icons==1,"offhand food and hardcore hearts supported");
        // Execute the distributed mixin handler with an animated native position.
        var hook=new fr.yapapouaiye.nexlux.standby.mixin.SaturationHudMixin() {};
        var hookType=fr.yapapouaiye.nexlux.standby.mixin.SaturationHudMixin.class;
        var foodHook=Arrays.stream(hookType.getDeclaredMethods()).filter(m->m.getName().equals("nexlux$food")).findFirst().orElseThrow();
        foodHook.setAccessible(true);
        SaturationState.receive(new SaturationPayload(1,5));
        gui=new GuiGraphicsExtractor(800,450);
        foodHook.invoke(hook,gui,net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED,
            net.minecraft.resources.Identifier.fromNamespaceAndPath("minecraft","hud/food_empty_hunger"),700,399,9,9,gui,player,400,709);
        check(gui.rectangles.isEmpty(),"contour waits until the native foreground has been drawn");
        foodHook.invoke(hook,gui,net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED,
            net.minecraft.resources.Identifier.fromNamespaceAndPath("minecraft","hud/food_full"),700,399,9,9,gui,player,400,709);
        check(!gui.rectangles.isEmpty(),"food foreground receives exactly one final contour");
        for(var r:gui.rectangles) check(r[1]>=399 && r[1]+r[3]<=408,"mixin follows vanilla shaking coordinate");
        player.off.food=null;
        for(float value:new float[]{0.01f,0.5f,1f,1.01f,1.5f,2f}) {
            SaturationState.receive(new SaturationPayload(1,value));
            gui=new GuiGraphicsExtractor(800,450);
            SaturationOverlay.saturation(gui,player,0,700,400);
            boolean diagonal=gui.rectangles.stream().anyMatch(r->r[0]==702 && r[1]==401);
            boolean leftRim=gui.rectangles.stream().anyMatch(r->r[0]==700 && r[1]==402);
            boolean bone=gui.rectangles.stream().anyMatch(r->r[0]==708 && r[1]==407);
            check(bone,"every partial contour keeps the bone end");
            check(diagonal==(value<=1) && leftRim==(value>1),"half saturation uses native diagonal shape, not a vertical crop");
        }
        // The diagonal seam must survive the opaque foreground of a full food icon.
        SaturationState.receive(new SaturationPayload(1,1));
        gui=new GuiGraphicsExtractor(800,450);
        foodHook.invoke(hook,gui,net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED,
            net.minecraft.resources.Identifier.fromNamespaceAndPath("minecraft","hud/food_empty"),700,399,9,9,gui,player,400,709);
        foodHook.invoke(hook,gui,net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED,
            net.minecraft.resources.Identifier.fromNamespaceAndPath("minecraft","hud/food_full"),700,399,9,9,gui,player,400,709);
        check(gui.image.getRGB(702,400)==settings.barColor,"half contour seam painted on top of native food");
        settings.icons=false;settings.levels=false;settings.bar=false;
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,0,700,400);SaturationOverlay.heart(gui,player,6,100,400,false);
        check(gui.icons==0 && gui.rectangles.isEmpty(),"three overlay settings can be disabled independently");
        settings.icons=true;settings.levels=true;settings.bar=true;
        SaturationState.clear();
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,0,700,400);
        check(gui.rectangles.isEmpty(),"unknown saturation never draws a guessed contour");
        settings.enabled=false;
        gui=new GuiGraphicsExtractor(800,450);SaturationOverlay.food(gui,player,0,700,400);SaturationOverlay.heart(gui,player,6,100,400,false);
        check(gui.icons==0 && gui.rectangles.isEmpty(),"module off disables every overlay");
        settings.enabled=true;
        check(!Arrays.asList(HudMetrics.IDS).contains("saturation"),"saturation removed from movable widgets");
    }

    static void renderSaturationHalves(Path output) throws Exception {
        var mc=Minecraft.getInstance();
        mc.player=new net.minecraft.client.player.LocalPlayer();
        var settings=LunarClientConfig.getSaturation();
        settings.enabled=true;settings.bar=true;settings.icons=false;
        mc.player.food.level=20;
        var gui=new GuiGraphicsExtractor(480,384);
        gui.canvas.scale(4,4);
        gui.canvas.setColor(new java.awt.Color(55,70,42));gui.canvas.fillRect(0,0,120,96);
        try(var zip=new ZipFile(System.getProperty("nexlux.textureJar"))) {
            var empty=javax.imageio.ImageIO.read(zip.getInputStream(zip.getEntry("assets/minecraft/textures/gui/sprites/hud/food_empty.png")));
            var full=javax.imageio.ImageIO.read(zip.getInputStream(zip.getEntry("assets/minecraft/textures/gui/sprites/hud/food_full.png")));
            float[] values={0,0.5f,1,1.5f,2,3,5};
            for(int row=0;row<values.length;row++) {
                SaturationState.receive(new SaturationPayload(1,values[row]));
                int y=5+row*13;
                gui.canvas.setColor(java.awt.Color.WHITE);gui.canvas.drawString(Float.toString(values[row]),1,y+8);
                for(int index=0;index<10;index++) {
                    int x=110-index*8;
                    gui.canvas.drawImage(empty,x,y,null);gui.canvas.drawImage(full,x,y,null);
                    SaturationOverlay.saturation(gui,mc.player,index,x,y);
                }
            }
        }
        javax.imageio.ImageIO.write(gui.image,"png",output.toFile());
        gui.canvas.dispose();settings.icons=true;
    }

    static void savedScaleChecks(net.minecraft.client.gui.screens.Screen editor,ExtraHudSettings selected,ExtraHudSettings other) {
        int saves=LunarClientConfig.saves;
        int oldWidth=HudMetrics.width("potions");float otherScale=other.scale;
        check(editor.mouseScrolled(selected.x+5,selected.y+5,0,1),"wheel over potion HUD consumed");
        check(selected.scale==1.05f && HudMetrics.width("potions")>oldWidth,"wheel updates actual rendered size");
        check(LunarClientConfig.saves>saves && other.scale==otherScale,"wheel saves only selected module scale");
        editor.mouseScrolled(selected.x+5,selected.y+5,0,1000);check(selected.scale==3,"wheel upper bound");
        editor.mouseScrolled(selected.x+5,selected.y+5,0,-1000);check(selected.scale==0.5f,"wheel lower bound");
        saves=LunarClientConfig.saves;
        check(!editor.mouseScrolled(799,449,0,1) && LunarClientConfig.saves==saves,"wheel outside HUD does not resize or save");
        selected.scale=1;ExtraHud.invalidate();
    }
}
