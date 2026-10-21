// Executes the render methods from the bundled JARs against a minimal GUI recorder.
// Game-only methods are replaced in the test classloader; the renderers stay intact.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const game = process.env.NEXLUX_GAME_ROOT || path.join(process.env.APPDATA, '.yapapouaiye-launcher/minecraft');
const jdk = path.join(game, 'runtime/java-runtime-epsilon/bin');
const asm = path.join(game, 'loader/neoforge/libraries/org/ow2/asm/asm/9.11/asm-9.11.jar');

test('bundled armor HUD: empty, every individual slot, full armor, preview and numbers', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-hud-test-'));
  const sources = {
    'net/minecraft/world/item/ItemStack.java': `package net.minecraft.world.item;
      public class ItemStack { public boolean empty; public ItemStack(boolean empty) { this.empty=empty; }
        public boolean isEmpty() { return empty; } public int getMaxDamage() { return 100; } }`,
    'net/minecraft/client/gui/Font.java': `package net.minecraft.client.gui;
      public class Font { public int width(String value) { return value.length()*6; } }`,
    'net/minecraft/client/Minecraft.java': `package net.minecraft.client;
      public class Minecraft { public net.minecraft.client.gui.Font font = new net.minecraft.client.gui.Font();
        static final Minecraft INSTANCE = new Minecraft(); public static Minecraft getInstance() { return INSTANCE; } }`,
    'fr/yapapouaiye/nexlux/client/LunarClientConfig.java': `package fr.yapapouaiye.nexlux.client;
      public class LunarClientConfig { public static boolean numbers; public static boolean isArmorNumbers() { return numbers; } }`,
  };
  const gui = `public int backgrounds, items, texts;
    public void fill(int a,int b,int c,int d,int color) { backgrounds++; }
    public void item(net.minecraft.world.item.ItemStack s,int x,int y) { items++; }
    public void itemDecorations(Font f,net.minecraft.world.item.ItemStack s,int x,int y) {}
    public void text(Font f,String s,int x,int y,int c,boolean shadow) { texts++; }
    public void renderItem(net.minecraft.world.item.ItemStack s,int x,int y) { items++; }
    public void renderItemDecorations(Font f,net.minecraft.world.item.ItemStack s,int x,int y) {}
    public int drawString(Font f,String s,int x,int y,int c,boolean shadow) { texts++; return 0; }`;
  for (const name of ['GuiGraphics', 'GuiGraphicsExtractor']) {
    sources[`net/minecraft/client/gui/${name}.java`] = `package net.minecraft.client.gui; public class ${name} { ${gui} }`;
  }
  sources['ArmorHudTest.java'] = `
    import java.nio.file.*; import java.util.zip.*; import java.lang.reflect.*;
    import org.objectweb.asm.*;
    import net.minecraft.world.item.ItemStack;
    public class ArmorHudTest extends ClassLoader {
      static final String OWNER="fr/yapapouaiye/nexlux/client/LunarClientEvents";
      static final String ROWS="[Lnet/minecraft/world/item/ItemStack;";
      static Class<?> loadRenderer(String jar) throws Exception {
        byte[] bytes;
        try(var zip=new ZipFile(jar); var in=zip.getInputStream(zip.getEntry(OWNER+".class"))) { bytes=in.readAllBytes(); }
        var writer=new ClassWriter(0);
        new ClassReader(bytes).accept(new ClassVisitor(Opcodes.ASM9,writer) {
          public FieldVisitor visitField(int a,String n,String d,String s,Object v) { return null; }
          public MethodVisitor visitMethod(int a,String n,String d,String s,String[] e) {
            return n.equals("renderArmorHud") || n.equals("renderEquippedArmorHud")
              ? super.visitMethod(a,n,d,s,e) : null;
          }
        },0);
        writer.visitField(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,"rows",ROWS,null,null).visitEnd();
        var resolve=writer.visitMethod(Opcodes.ACC_PRIVATE|Opcodes.ACC_STATIC,"resolveArmorRows","(Z)"+ROWS,null,null);
        resolve.visitCode(); resolve.visitFieldInsn(Opcodes.GETSTATIC,OWNER,"rows",ROWS);
        resolve.visitInsn(Opcodes.ARETURN); resolve.visitMaxs(1,1); resolve.visitEnd();
        constant(writer,"getArmorHudTextWidth","(Z)I",12,1);
        constant(writer,"isArmorHudNumbersLeft","(IZ)Z",0,2);
        constant(writer,"armorRemaining","(Lnet/minecraft/world/item/ItemStack;)I",50,1);
        constant(writer,"armorDurabilityColor","(II)I",-1,2);
        writer.visitEnd();
        return new ArmorHudTest().defineClass(OWNER.replace('/','.'),writer.toByteArray(),0,writer.toByteArray().length);
      }
      static void constant(ClassWriter w,String n,String d,int value,int locals) {
        var m=w.visitMethod(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,n,d,null,null);
        m.visitCode(); m.visitLdcInsn(value); m.visitInsn(Opcodes.IRETURN); m.visitMaxs(1,locals); m.visitEnd();
      }
      public static void main(String[] args) throws Exception {
        for(String jar:args) {
          var renderer=loadRenderer(jar);
          var method=java.util.Arrays.stream(renderer.getMethods()).filter(m->m.getName().equals("renderArmorHud")).findFirst().orElseThrow();
          var gui=method.getParameterTypes()[0];
          for(boolean preview:new boolean[]{false,true}) for(boolean numbers:new boolean[]{false,true}) for(int mask:new int[]{0,1,2,4,8,15}) {
            // Preview resolution supplies four sample items, as in the real editor.
            int equipped=preview?15:mask;
            ItemStack[] rows=new ItemStack[4];
            for(int i=0;i<4;i++) rows[i]=new ItemStack((equipped & (1<<i))==0);
            renderer.getField("rows").set(null,rows);
            fr.yapapouaiye.nexlux.client.LunarClientConfig.numbers=numbers;
            var draw=gui.getConstructor().newInstance();
            method.invoke(null,draw,100,100,preview);
            int expectedItems=Integer.bitCount(equipped);
            if(gui.getField("backgrounds").getInt(draw)!=(expectedItems==0?0:1)
                || gui.getField("items").getInt(draw)!=expectedItems
                || gui.getField("texts").getInt(draw)!=(numbers?expectedItems:0))
              throw new AssertionError(jar+" mask="+mask+" preview="+preview+" numbers="+numbers);
          }
          System.out.println(jar+": 24 render cases passed");
        }
      }
    }`;
  try {
    const files = Object.entries(sources).map(([name, contents]) => {
      const file = path.join(temp, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
      return file;
    });
    execFileSync(path.join(jdk, 'javac.exe'), ['-cp', asm, '-d', temp, ...files], { stdio: 'pipe' });
    const jars = process.env.NEXLUX_TEST_JARS ? JSON.parse(process.env.NEXLUX_TEST_JARS)
      : ['nexlux-1.1.0.jar', 'nexlux-26.2.jar'].map(name => path.resolve(__dirname, '../mods', name));
    const result = execFileSync(path.join(jdk, 'java.exe'), ['-Xverify:all', '-cp', `${temp};${asm}`, 'ArmorHudTest', ...jars], { encoding: 'utf8' });
    assert.equal((result.match(/24 render cases passed/g) || []).length, jars.length);
    console.log(result.trim());
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
