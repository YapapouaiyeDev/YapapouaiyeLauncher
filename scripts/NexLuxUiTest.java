import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import java.lang.reflect.*;
import org.objectweb.asm.*;
import fr.yapapouaiye.nexlux.client.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;

/** Loads the distributed methods, replacing only game services, not UI logic. */
public class NexLuxUiTest extends ClassLoader {
    final String jar;
    final boolean configOnly;
    NexLuxUiTest(String jar, boolean configOnly) { this.jar = jar; this.configOnly = configOnly; }
    @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        boolean events = !configOnly && name.equals("fr.yapapouaiye.nexlux.client.LunarClientEvents");
        boolean target = configOnly ? name.equals("fr.yapapouaiye.nexlux.client.LunarClientConfig")
            : events || name.startsWith("fr.yapapouaiye.nexlux.client.LunarClientScreen");
        if (!target) return super.loadClass(name, resolve);
        Class<?> known = findLoadedClass(name);
        if (known != null) return known;
        try (var zip = new ZipFile(jar); var in = zip.getInputStream(zip.getEntry(name.replace('.', '/') + ".class"))) {
            var writer = new ClassWriter(0);
            new ClassReader(in.readAllBytes()).accept(new ClassVisitor(Opcodes.ASM9, writer) {
                public FieldVisitor visitField(int a, String n, String d, String s, Object v) {
                    return events || configOnly && !d.equals("I") && !d.equals("[I") ? null : super.visitField(a,n,d,s,v);
                }
                public MethodVisitor visitMethod(int a, String n, String d, String s, String[] e) {
                    if (events && !n.equals("renderHud") && !n.equals("maintainNightVision")) return null;
                    if (configOnly && !(n.equals("ensureHudViewport") || n.equals("resetHudPositions")
                            || n.matches("(get|set)(Coords|Cps|Armor|Speed|Fps|Ping)(X|Y|Pos)"))) return null;
                    if (!configOnly && n.equals("playClickSound")) {
                        var m = super.visitMethod(a,n,d,s,e); m.visitCode(); m.visitInsn(Opcodes.RETURN); m.visitMaxs(0,1); m.visitEnd(); return null;
                    }
                    return super.visitMethod(a,n,d,s,e);
                }
            }, 0);
            if (configOnly) {
                var m = writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_STATIC, "save", "()V", null, null);
                m.visitCode(); m.visitInsn(Opcodes.RETURN); m.visitMaxs(0,0); m.visitEnd();
            }
            if (events) {
                for(String n:new String[]{"leftClicks","rightClicks"}) writer.visitField(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,n,"Ljava/util/List;",null,null).visitEnd();
                var m=writer.visitMethod(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,"renderArmorHud","(Lnet/minecraft/client/gui/GuiGraphicsExtractor;IIZ)V",null,null);
                m.visitCode();m.visitInsn(Opcodes.RETURN);m.visitMaxs(0,4);m.visitEnd();
            }
            writer.visitEnd();
            byte[] bytes = writer.toByteArray();
            return defineClass(name, bytes, 0, bytes.length);
        } catch (Exception e) { throw new ClassNotFoundException(name, e); }
    }
    static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
    static void field(Class<?> c, String name, int value) throws Exception {
        var f = c.getDeclaredField(name); f.setAccessible(true); f.setInt(null, value);
    }
    static int get(Class<?> c, String name) throws Exception { return (int)c.getMethod("get" + name).invoke(null); }

    public static void main(String[] args) throws Exception {
        var menuClass = new NexLuxUiTest(args[0], false).loadClass("fr.yapapouaiye.nexlux.client.LunarClientScreen");
        Screen menu = (Screen)menuClass.getConstructor().newInstance();
        for (int[] viewport : new int[][]{{854,480},{640,360},{480,270},{320,240},{260,180}}) {
            int width = viewport[0], height = viewport[1];
            var l = new ClientMenuLayout(width,height);
            check(l.x >= 0 && l.y >= 0 && l.x + l.width <= width && l.y + l.height <= height, "panel inside window");
            check(l.searchY > l.toolbarY || l.searchX >= l.x + 178, "search and editor do not overlap");
            menu.start(width,height);
            menu.mouseScrolled(l.gridX + 5, l.gridY + 5, 0, 10000);
            GuiGraphicsExtractor gui = new GuiGraphicsExtractor(width,height);
            menu.extractRenderState(gui,0,0,0);
            check(gui.pixels > 150, "pixel icons are actually rendered");
            for (int i = 0; i < 10; i++) {
                int scroll = Math.min(l.maxScroll(10), Math.max(0,l.cardY(i,0)-l.gridY));
                int mx = l.cardX(i)+l.cardWidth/2, my=l.cardY(i,scroll)+ClientMenuLayout.CARD_HEIGHT/2;
                if (l.inGrid(mx,my)) check(l.hitCard(mx,my,10,scroll)==i,"card hit test after scroll");
            }
            check(l.hitCard(l.gridX,l.gridY-1,10,l.maxScroll(10))==-1,"toolbar never toggles a clipped card");
            check(l.hitCard(l.cardX(0)+l.cardWidth+1,l.gridY+5,10,0)==-1,"gaps are not clickable");
            javax.imageio.ImageIO.write(gui.image,"png",Path.of(args[1],"nexlux-menu-"+width+".png").toFile());
            menu.mouseClicked(new MouseButtonEvent(l.cardX(0)+10,l.gridY+10,0),false);
            check(LunarClientConfig.isNightVision(),"actual menu dispatches the correct toggle");
            menu.mouseClicked(new MouseButtonEvent(l.cardX(0)+10,l.gridY+10,0),false);
            if (l.maxScroll(10)>0) {
                check(menu.mouseScrolled(l.gridX+5,l.gridY+5,0,-8),"grid scroll consumes wheel");
                menu.extractRenderState(gui,0,0,0);
            }
            check(!menu.mouseScrolled(l.x,l.y,0,-1),"toolbar scroll ignored");
            System.out.println(width+"x"+height+": "+l.columns+" columns, render and input passed");
        }
        LunarClientConfig.getClientMenu().reset();
        menu.start(1000,700);
        var popup=LunarClientConfig.getClientMenu().layout(1000,700);
        int saves=LunarClientConfig.saves;
        check(menu.mouseClicked(new MouseButtonEvent(popup.x+60,popup.y+12,0),false),"header starts moving");
        check(menu.mouseDragged(new MouseButtonEvent(popup.x+100,popup.y+42,0),40,30),"header drag consumed");
        check(LunarClientConfig.saves==saves,"drag does not write on every mouse event");
        var moved=LunarClientConfig.getClientMenu().layout(1000,700);
        check(moved.x==popup.x+40 && moved.y==popup.y+30,"popup follows the title drag");
        menu.mouseReleased(new MouseButtonEvent(moved.x+60,moved.y+12,0));
        check(LunarClientConfig.saves==saves+1,"position saved on release");
        menu.mouseClicked(new MouseButtonEvent(moved.x+moved.width-5,moved.y+moved.height-5,0),false);
        menu.mouseDragged(new MouseButtonEvent(moved.x+moved.width-205,moved.y+moved.height-85,0),-200,-80);
        menu.mouseReleased(new MouseButtonEvent(0,0,0));
        var resized=LunarClientConfig.getClientMenu().layout(1000,700);
        check(resized.width==moved.width-200 && resized.height==moved.height-80,"corner changes popup dimensions");
        check(resized.x==moved.x && resized.y==moved.y,"resizing preserves the top-left corner");
        var searchField=menuClass.getDeclaredField("searchBox");searchField.setAccessible(true);
        var search=(net.minecraft.client.gui.components.EditBox)searchField.get(menu);
        search.setValue("Zoom");
        menu.mouseClicked(new MouseButtonEvent(resized.x+60,resized.y+12,0),false);
        menu.mouseDragged(new MouseButtonEvent(-1000,-1000,0),-1000,-1000);
        menu.mouseReleased(new MouseButtonEvent(-1000,-1000,0));
        var clamped=LunarClientConfig.getClientMenu().layout(1000,700);
        check(clamped.x==10 && clamped.y==10,"movement stays inside the viewport");
        check(search.getValue().equals("Zoom"),"search survives geometry changes");
        var json=new com.google.gson.Gson().toJson(LunarClientConfig.getClientMenu());
        var restored=new com.google.gson.Gson().fromJson(json,ClientMenuWindow.class);
        var restoredLayout=restored.layout(1000,700);
        check(restoredLayout.width==clamped.width && restoredLayout.height==clamped.height && restoredLayout.x==clamped.x,"geometry survives configuration serialization");
        restored.layout(320,240);
        check(restored.layout(1000,700).width==clamped.width,"temporary small viewports preserve preferred size");
        Screen reopened=(Screen)menuClass.getConstructor().newInstance();reopened.start(1000,700);
        var persistedLayout=LunarClientConfig.getClientMenu().layout(1000,700);
        var popupDraw=new GuiGraphicsExtractor(1000,700);reopened.extractRenderState(popupDraw,0,0,0);
        javax.imageio.ImageIO.write(popupDraw.image,"png",Path.of(args[1],"nexlux-popup-resized.png").toFile());
        check(persistedLayout.width==resized.width,"popup preferences survive reopening");
        reopened.mouseClicked(new MouseButtonEvent(persistedLayout.x+60,persistedLayout.y+12,0),true);
        check(LunarClientConfig.getClientMenu().layout(1000,700).width==640,"double-click resets popup size");
        var minWindow=new ClientMenuWindow();minWindow.resizeTo(800,600,10,10,0,0);
        check(minWindow.layout(800,600).width==ClientMenuLayout.MIN_WIDTH,"minimum width is usable");
        check(minWindow.layout(800,600).height==ClientMenuLayout.MIN_HEIGHT,"minimum height is usable");
        var cfg = new NexLuxUiTest(args[0],true).loadClass("fr.yapapouaiye.nexlux.client.LunarClientConfig");
        cfg.getMethod("resetHudPositions").invoke(null);
        field(cfg,"hudReferenceWidth",800); field(cfg,"hudReferenceHeight",450);
        field(cfg,"fpsX",752); field(cfg,"cpsX",737); field(cfg,"pingX",766);
        field(cfg,"fpsY",8); field(cfg,"cpsY",30); field(cfg,"pingY",52);
        field(cfg,"armorX",750); field(cfg,"armorY",380);
        var window = Minecraft.getInstance().window;
        int originalFpsY = get(cfg,"FpsY");
        for (int[] viewport : new int[][]{{400,225},{800,450},{320,240},{960,540}}) {
            window.width=viewport[0]; window.height=viewport[1];
            int fps=get(cfg,"FpsX"), cps=get(cfg,"CpsX"), ping=get(cfg,"PingX");
            check(fps+HudMetrics.width("fps")==cps+HudMetrics.width("cps") && fps+HudMetrics.width("fps")==ping+HudMetrics.width("ping"),"right edges of compact counters align on resize");
            check(get(cfg,"FpsY")==originalFpsY,"top anchoring survives repeated window/fullscreen changes");
            for(String id: new String[]{"Coords","Cps","Armor","Speed","Fps","Ping"}) {
                String key=id.toLowerCase(Locale.ROOT); int pad=HudMetrics.padding(key);
                check(get(cfg,id+"X")-pad>=4,"left HUD edge inside window");
                check(get(cfg,id+"X")-pad+HudMetrics.width(key)<=window.width-4,"right HUD edge inside window");
                check(get(cfg,id+"Y")-pad+HudMetrics.height(key)<=window.height-4,"bottom HUD edge inside window");
            }
        }
        window.width=800; window.height=450;
        cfg.getMethod("resetHudPositions").invoke(null);
        int defaultFpsY=get(cfg,"FpsY"), defaultCpsY=get(cfg,"CpsY");
        window.width=400; window.height=225;
        check(get(cfg,"FpsY")==defaultFpsY && get(cfg,"CpsY")==defaultCpsY,"default stack does not collapse on resize");
        check(HudLayout.snap(97,80,new int[]{100},new int[]{80},800)==100,"left edges snap");
        check(HudLayout.snap(120,60,new int[]{100},new int[]{80},800)==120,"right edges snap");
        check(HudLayout.snap(300,80,new int[]{100},new int[]{80},800)==300,"distant positions remain free");
        for (String id : new String[]{"fps","ping","cps","speed"})
            check(HudMetrics.width(id)==Minecraft.getInstance().font.width(HudMetrics.counterText(id))+8,"compact background follows actual text: "+id);
        var events = new NexLuxUiTest(args[0],false).loadClass("fr.yapapouaiye.nexlux.client.LunarClientEvents");
        events.getField("leftClicks").set(null,new ArrayList<>());
        events.getField("rightClicks").set(null,new ArrayList<>());
        LunarClientConfig.setFps(true,false); LunarClientConfig.setCpsCounter(true,false); LunarClientConfig.setPing(true,false);
        var hud = new GuiGraphicsExtractor(800,450);
        events.getMethod("renderHud",GuiGraphicsExtractor.class).invoke(null,hud);
        check(hud.rectangles.size()==3,"actual FPS/CPS/ping render three backgrounds");
        for(int i=0;i<3;i++) check(hud.rectangles.get(i)[2]==HudMetrics.width(new String[]{"cps","fps","ping"}[i]),"actual background matches editor width");
        window.width=120; window.height=120;
        field(cfg,"coordsX",9999); field(cfg,"coordsY",9999);
        get(cfg,"CoordsX");
        // Same viewport, but a stale launcher save or longer coordinate text moves the widget outside it.
        field(cfg,"coordsX",9999); field(cfg,"coordsY",9999);
        check(get(cfg,"CoordsX")+HudMetrics.width("coords")-4<=120,"stale coordinates clamped without a viewport change");
        check(get(cfg,"CoordsY")+HudMetrics.height("coords")-4<=120,"coordinates clamped vertically at large GUI scale");
        LunarClientConfig.setFps(false,false); LunarClientConfig.setCpsCounter(false,false); LunarClientConfig.setPing(false,false);
        LunarClientConfig.setCoordinates(true,false);
        var compactHud=new GuiGraphicsExtractor(120,120);
        events.getMethod("renderHud",GuiGraphicsExtractor.class).invoke(null,compactHud);
        check(compactHud.texts.equals(List.of("X: 206","Y: 87","Z: -345","EAST")),"compact coordinates preserve every axis and direction: "+compactHud.texts);
        check(compactHud.rectangles.get(0)[2]<=112,"coordinate background fits a very small GUI viewport");
        var mc=Minecraft.getInstance();
        LunarClientConfig.setNightVision(true,false);
        var maintain=events.getMethod("maintainNightVision");
        maintain.invoke(null); check(mc.player.effect!=null,"Night Vision applied after joining");
        mc.player.effect=null; maintain.invoke(null);check(mc.player.effect!=null,"server-cleared effect reapplied");
        mc.player=null; maintain.invoke(null);
        mc.player=new net.minecraft.client.player.LocalPlayer();maintain.invoke(null);
        check(mc.player.effect!=null,"Night Vision restored on a new player after reconnect");
        LunarClientConfig.setNightVision(false,false);maintain.invoke(null);
        check(mc.player.effect==null,"explicit disable removes the effect");
        System.out.println("All menu and HUD cases passed");
    }
}
