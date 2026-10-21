import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;

/** Backport the empty armor HUD fix to the source-less 1.21.1 companion.
 * Run with JDK 21+ and NeoForge's ASM jar: input.jar new-output.jar.
 * Keeps the original renderer and its preview behavior behind a visibility guard.
 */
class PatchCompanionArmor {
    static final String OWNER = "fr/yapapouaiye/nexlux/client/LunarClientEvents";
    static final String STACK = "net/minecraft/world/item/ItemStack";
    static final String DESCRIPTOR = "(Lnet/minecraft/client/gui/GuiGraphics;IIZ)V";
    static final String ORIGINAL = "renderEquippedArmorHud";

    static byte[] patch(byte[] input) {
        ClassReader reader = new ClassReader(input);
        ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
        int[] found = {0};
        reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
            @Override public MethodVisitor visitMethod(int access, String name, String descriptor,
                    String signature, String[] exceptions) {
                if (name.equals(ORIGINAL)) throw new IllegalArgumentException("Already patched");
                if (name.equals("renderArmorHud") && descriptor.equals(DESCRIPTOR)) {
                    found[0]++;
                    return super.visitMethod(Opcodes.ACC_PRIVATE | Opcodes.ACC_STATIC,
                            ORIGINAL, descriptor, signature, exceptions);
                }
                return super.visitMethod(access, name, descriptor, signature, exceptions);
            }
        }, 0);
        if (found[0] != 1) throw new IllegalArgumentException("Expected exactly one armor renderer");

        MethodVisitor mv = writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_STATIC,
                "renderArmorHud", DESCRIPTOR, null, null);
        mv.visitCode();
        mv.visitVarInsn(Opcodes.ILOAD, 3);
        mv.visitMethodInsn(Opcodes.INVOKESTATIC, OWNER, "resolveArmorRows", "(Z)[L" + STACK + ";", false);
        Label visible = new Label();
        for (int i = 0; i < 4; i++) {
            // resolveArmorRows always supplies four non-null stacks, including EMPTY.
            mv.visitInsn(Opcodes.DUP);
            mv.visitInsn(Opcodes.ICONST_0 + i);
            mv.visitInsn(Opcodes.AALOAD);
            mv.visitMethodInsn(Opcodes.INVOKEVIRTUAL, STACK, "isEmpty", "()Z", false);
            mv.visitJumpInsn(Opcodes.IFEQ, visible);
        }
        mv.visitInsn(Opcodes.POP);
        mv.visitInsn(Opcodes.RETURN);
        mv.visitLabel(visible);
        mv.visitFrame(Opcodes.F_SAME1, 0, null, 1, new Object[]{"[L" + STACK + ";"});
        mv.visitInsn(Opcodes.POP);
        for (int i = 0; i < 4; i++) mv.visitVarInsn(i == 0 ? Opcodes.ALOAD : Opcodes.ILOAD, i);
        mv.visitMethodInsn(Opcodes.INVOKESTATIC, OWNER, ORIGINAL, DESCRIPTOR, false);
        mv.visitInsn(Opcodes.RETURN);
        mv.visitMaxs(0, 0);
        mv.visitEnd();
        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: input.jar new-output.jar");
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        if (Files.exists(output)) throw new IllegalArgumentException("Use a new output path");
        try (ZipFile zip = new ZipFile(args[0])) {
            var entries = Collections.list(zip.entries());
            for (var entry : entries) {
                if (entry.getName().matches("(?i)META-INF/.*\\.(SF|RSA|DSA|EC)"))
                    throw new IllegalArgumentException("Signed jar cannot be patched");
            }
            byte[] patched;
            try (var in = zip.getInputStream(Objects.requireNonNull(zip.getEntry(OWNER + ".class")))) {
                patched = patch(in.readAllBytes());
            }
            try (var out = new ZipOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
                for (var entry : entries) {
                    var copy = new ZipEntry(entry.getName());
                    copy.setTime(entry.getTime());
                    out.putNextEntry(copy);
                    if (entry.getName().equals(OWNER + ".class")) out.write(patched);
                    else try (var in = zip.getInputStream(entry)) { in.transferTo(out); }
                    out.closeEntry();
                }
            }
        }
        System.out.println("Empty armor HUD hidden: " + output);
    }
}
