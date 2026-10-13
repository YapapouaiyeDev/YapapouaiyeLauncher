import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;

/** Updates NeoForge metadata and embedded NexLux version constants together.
 * Run with JDK 21 and ASM on the classpath: input.jar output.jar oldVersion newVersion.
 */
class SetCompanionVersion {
    static byte[] updateClass(byte[] bytes, String oldVersion, String version) {
        ClassReader reader = new ClassReader(bytes);
        ClassWriter writer = new ClassWriter(reader, 0);
        reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
            @Override public FieldVisitor visitField(int access, String name, String descriptor, String signature, Object value) {
                return super.visitField(access, name, descriptor, signature, oldVersion.equals(value) ? version : value);
            }
            @Override public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
                return new MethodVisitor(Opcodes.ASM9, super.visitMethod(access, name, descriptor, signature, exceptions)) {
                    @Override public void visitLdcInsn(Object value) {
                        super.visitLdcInsn(oldVersion.equals(value) ? version : value);
                    }
                };
            }
        }, 0);
        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 4 || !args[3].matches("[0-9]+(?:\\.[0-9]+)*"))
            throw new IllegalArgumentException("Usage: input.jar output.jar oldVersion newVersion");
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalArgumentException("Output already exists");
        try (ZipFile zip = new ZipFile(args[0])) {
            var entries = Collections.list(zip.entries());
            String metadata = "META-INF/neoforge.mods.toml";
            String oldDeclaration = "version=\"" + args[2] + "\"";
            String toml;
            try (var in = zip.getInputStream(Objects.requireNonNull(zip.getEntry(metadata)))) {
                toml = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            if (!toml.contains(oldDeclaration)) throw new IllegalArgumentException("Version metadata mismatch");
            for (var entry : entries) {
                if (entry.getName().matches("(?i)META-INF/.*\\.(SF|RSA|DSA|EC)"))
                    throw new IllegalArgumentException("Signed jar cannot be modified");
            }
            try (var out = new ZipOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
                for (var entry : entries) {
                    byte[] data;
                    try (var in = zip.getInputStream(entry)) { data = in.readAllBytes(); }
                    if (entry.getName().equals(metadata))
                        data = toml.replace(oldDeclaration, "version=\"" + args[3] + "\"").getBytes(StandardCharsets.UTF_8);
                    else if (entry.getName().startsWith("fr/yapapouaiye/nexlux/") && entry.getName().endsWith(".class"))
                        data = updateClass(data, args[2], args[3]);
                    var copy = new ZipEntry(entry.getName());
                    copy.setTime(entry.getTime());
                    out.putNextEntry(copy);
                    out.write(data);
                    out.closeEntry();
                }
            }
        }
        System.out.println("NexLux version " + args[3] + ": " + output);
    }
}
