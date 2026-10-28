package fr.yapapouaiye.moteur.config;
import org.junit.Test;
import static org.junit.Assert.*;
public class MicrosoftClientIdTest {
    @Test public void blankAndCompilerNullAreNotValidClientIds(){for(String value:new String[]{null,"","null","  ","not-an-id"})assertEquals("",MicrosoftClientId.normalize(value));}
    @Test public void publicIdentifiersAreNormalizedWithoutAcceptingCredentials(){assertEquals("11111111-aaaa-bbbb-cccc-222222222222",MicrosoftClientId.normalize(" 11111111-AAAA-BBBB-CCCC-222222222222 "));assertEquals("0123456789abcdef",MicrosoftClientId.normalize("0123456789ABCDEF"));}
    @Test public void urlsEmailsAndSecretLikeStringsAreRejected(){for(String value:new String[]{"person@example.com","https://example.com/11111111-aaaa-bbbb-cccc-222222222222","11111111-aaaa-bbbb-cccc-222222222222\nsecret","abc!123"})assertEquals("",MicrosoftClientId.normalize(value));}
}
