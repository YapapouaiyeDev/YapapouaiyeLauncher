package fr.yapapouaiye.nexlux.standby.mixin;
import net.minecraft.client.particle.ParticleEngine;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(ParticleEngine.class)
public interface StandbyParticlesMixin {
    @Invoker("clearParticles")
    void nexlux$clearParticles();
}
