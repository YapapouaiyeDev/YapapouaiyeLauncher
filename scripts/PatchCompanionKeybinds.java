import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;

/**
 * Fix the bundled companion without rebuilding unavailable Java sources.
 * Its config loader calls applyFullBright before mod key registration. Calling
 * Options.save there discards mod bindings from options.txt before they load.
 * Gamma still changes in memory; normal Minecraft saves persist it later.
 * Run with JDK 21 and NeoForge's ASM jar on the classpath, input/output jar paths.
 */
class PatchCompanionKeybinds {
    static final String TARGET = "fr/yapapouaiye/nexlux/client/LunarClientConfig.class";

    static byte[] patch(byte[] original) {
        ClassReader reader = new ClassReader(original);
        ClassWriter writer = new ClassWriter(reader, 0);
        int[] removed = {0};
        reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
            @Override public MethodVisitor visitMethod(int access, String name, String descriptor,
                    String signature, String[] exceptions) {
                MethodVisitor delegate = super.visitMethod(access, name, descriptor, signature, exceptions);
                if (!name.equals("applyFullBright") || !descriptor.equals("(Z)V")) return delegate;
                return new MethodVisitor(Opcodes.ASM9, delegate) {
                    @Override public void visitMethodInsn(int opcode, String owner, String name,
                            String descriptor, boolean isInterface) {
                        if (opcode == Opcodes.INVOKEVIRTUAL && owner.equals("net/minecraft/client/Options")
                                && name.equals("save") && descriptor.equals("()V")) {
                            // Consume the Options receiver, preserving the original stack effect.
                            super.visitInsn(Opcodes.POP);
                            removed[0]++;
                        } else super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
                    }
                };
            }
        }, 0);
        if (removed[0] != 1) throw new IllegalStateException("Expected one unsafe Options.save call, found " + removed[0]);
        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: input.jar output.jar");
        Path input = Path.of(args[0]).toAbsolutePath().normalize();
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        if (input.equals(output) || Files.exists(output)) throw new IllegalArgumentException("Use a new output path");
        try (ZipFile zip = new ZipFile(input.toFile())) {
            ZipEntry target = zip.getEntry(TARGET);
            if (target == null) throw new IllegalArgumentException("Companion class missing");
            byte[] patched;
            try (InputStream in = zip.getInputStream(target)) { patched = patch(in.readAllBytes()); }
            List<? extends ZipEntry> entries = Collections.list(zip.entries());
            for (ZipEntry entry : entries) {
                if (entry.getName().matches("(?i)META-INF/.*\\.(SF|RSA|DSA|EC)"))
                    throw new IllegalArgumentException("Signed jar cannot be patched");
            }
            try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
                for (ZipEntry entry : entries) {
                    ZipEntry copy = new ZipEntry(entry.getName());
                    copy.setTime(entry.getTime());
                    out.putNextEntry(copy);
                    if (entry.getName().equals(TARGET)) out.write(patched);
                    else try (InputStream in = zip.getInputStream(entry)) { in.transferTo(out); }
                    out.closeEntry();
                }
            }
        }
        System.out.println("Removed premature Options.save from applyFullBright: " + output);
    }
}
