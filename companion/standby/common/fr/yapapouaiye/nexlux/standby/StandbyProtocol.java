package fr.yapapouaiye.nexlux.standby;

import java.util.UUID;

/** Reserved requests on the existing optional channel. Old servers answer the
 * probe with CAPABILITIES, never with the acknowledgement needed to freeze. */
public final class StandbyProtocol {
    public static final UUID PROBE = UUID.fromString("ad5e47d1-870b-48ca-947a-67b9a1120001");
    public static final UUID ENTER = UUID.fromString("ad5e47d1-870b-48ca-947a-67b9a1120002");
    public static final UUID WAKE = UUID.fromString("ad5e47d1-870b-48ca-947a-67b9a1120003");
    private StandbyProtocol() {}
    public static boolean owns(UUID request) {
        return PROBE.equals(request) || ENTER.equals(request) || WAKE.equals(request);
    }
}
