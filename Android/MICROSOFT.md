# Activer Microsoft pour le launcher Android — développeur / éditeur

La configuration `microsoft.json` sélectionne par défaut le même client public que la bibliothèque `minecraft-java-core` du launcher PC (`00000000402b5328`). Ce client préexistant n'est pas une inscription propre à Yapapouaiye. L'identifiant de l'application créée par l'éditeur est conservé dans `publisherClientId` ; il n'est pas utilisé par défaut tant que l'accès Minecraft de cette application reste refusé.

Le joueur ne doit ni créer d'application Microsoft ni saisir de client ID. Le client intégré à l'APK ne peut pas être remplacé par une ancienne préférence locale. Un identifiant de forme valide ne prouve pas que les services acceptent une connexion complète.

## Parcours compatible avec le PC

Le client public du PC est refusé par le point d'entrée moderne du code d'appareil (`AADSTS700016`). Copier seulement son identifiant dans le parcours Android ne suffit donc pas. Pour ce client précis, l'application utilise le même parcours par code d'autorisation que la bibliothèque PC : page Microsoft, retour HTTPS `https://login.live.com/oauth20_desktop.srf`, puis échange et renouvellement de jetons sur `https://login.live.com/oauth20_token.srf`.

Le retour est capturé dans la WebView de connexion, sans interface JavaScript native. Le schéma HTTPS, l'hôte, le port, le chemin et un `state` aléatoire propre à la tentative sont vérifiés. Les paramètres ambigus et les réponses sans code sont rejetés. Le code reste en mémoire jusqu'à l'échange. Fermer la page annule l'attente ; une ancienne page ne peut pas annuler une nouvelle tentative. Le navigateur externe n'est pas proposé pour ce parcours, dont le retour exige l'interception par l'app. Les accès aux fichiers, au contenu local et au contenu HTTP mixte sont désactivés.

Les étapes Xbox, XSTS, Minecraft Services, vérification de licence et récupération du profil restent appliquées au compte Microsoft. Le mode pseudo hors ligne reste distinct. Un client GUID fourni à la compilation conserve le parcours par code d'appareil existant. Changer de client peut nécessiter une nouvelle connexion des comptes Microsoft enregistrés.

Le 27 octobre 2026, cette connexion a été effectuée sur le Xiaomi avec l'APK adapté : l'utilisateur a confirmé le retour de son pseudo Minecraft, puis le statut **Connecté** a été vérifié dans la véritable interface du launcher. Cela valide la connexion jusqu'au profil Minecraft pour cet essai. Le renouvellement utilise l'endpoint du parcours PC ; aucun renouvellement forcé d'un jeton valide ni nouveau lancement du jeu n'a été effectué pour cette correction.

## Inscription propre à l'éditeur

L'app ne propose aucun champ de configuration Microsoft. Les anciennes préférences locales `microsoftClientId` sont ignorées. Avec l'identifiant intégré, le joueur utilise seulement **Se connecter avec Microsoft** et suit la connexion officielle. Un APK compilé avec une ressource vide ou invalide indique que cette connexion n'est pas activée.

1. Dans le [centre Microsoft Entra](https://entra.microsoft.com/), ouvrir **App registrations / Inscriptions d'applications → New registration** et enregistrer une application au nom du launcher. Choisir un type de comptes incluant les **comptes Microsoft personnels** pour les comptes Xbox/Minecraft grand public. [Documentation Microsoft sur l'inscription](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).
2. Dans les paramètres d'authentification de cette application, activer **Allow public client flows / Autoriser les flux de clients publics** pour le flux par code d'appareil utilisé par ce launcher. Aucun secret client n'est à embarquer dans l'APK. [Documentation Microsoft du flux par code d'appareil](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code).

   Si le passage aux comptes personnels échoue avec **Property api.requestedAccessTokenVersion is invalid**, ouvrir **Manifeste**, chercher `requestedAccessTokenVersion` dans le bloc `api` et mettre cette valeur à `2` sans remplacer le reste du bloc. Enregistrer, puis enregistrer le choix des comptes personnels dans l'onglet d'authentification. Cette valeur est requise pour `PersonalMicrosoftAccount` et `AzureADandPersonalMicrosoftAccount`. [Référence Microsoft du manifeste](https://learn.microsoft.com/en-us/entra/identity-platform/reference-microsoft-graph-app-manifest).
3. L'application doit également être acceptée par les services Xbox/Minecraft qu'elle appelle. L'inscription Entra seule ne prouve pas cet accès. Vérifier les exigences actuelles auprès du support Minecraft et la procédure d'examen de l'AppID avant d'annoncer la connexion comme opérationnelle.
4. Conserver **Application (client) ID** dans `Android/microsoft.json`, puis compiler l'APK avec `Android/build.ps1`. Le patch amont l'intègre par défaut à la ressource `oauth_api_key`, y compris pour une reconstruction depuis l'archive de sources. La variable d'environnement `OAUTH_API_KEY` permet de le remplacer à la compilation. Le projet amont prend aussi en charge `oauth.api.key` dans `local.properties`, mais le script de préparation réécrit ce fichier. Ne jamais fournir de secret client.
5. Vérifier dans cet APK **Se connecter avec Microsoft**, le code d'appareil et la connexion sur la page Microsoft, avec un compte qui possède Minecraft Java. La sélection du compte et un lancement réel doivent être validés avant de distribuer une version annonçant cette connexion comme opérationnelle.

L'APK contient un client ID public, jamais un secret client. Dans le parcours compatible PC, il s'agit du client préexistant de la bibliothèque PC et non d'une nouvelle approbation de Yapapouaiye. Les identifiants du joueur sont saisis sur la page Microsoft.

Les erreurs finales du flux OAuth sont maintenant traitées avant d'annoncer que l'authentification a réussi. Cela améliore le retour d'erreur, mais ne crée pas une inscription Microsoft et n'accorde pas d'autorisation au launcher.

## Erreurs des services

- **HTTP 429** : le service limite temporairement les demandes. Le launcher indique cette limitation au lieu de prétendre que la connexion Internet est coupée. Les réessais automatiques d'une requête s'arrêtent dès la première réponse 429. Attendre avant de réessayer manuellement ; aucune durée de déblocage n'est garantie. La réponse 429 de `api.minecraftservices.com/authentication/login_with_xbox` a été observée sur le téléphone après le passage Microsoft/Xbox.
- **HTTP 403 de Minecraft Services** : la connexion est refusée. Le launcher distingue ce refus d'une panne réseau et invite l'éditeur à vérifier l'autorisation de son application. Ce code seul ne prouve pas le motif exact du refus.

Les refus HTTP 401 et 403 ne sont pas automatiquement répétés à l'identique : une répétition immédiate ne corrige pas les autorisations ou la session et peut masquer le premier refus derrière une limitation ultérieure. Les réessais existants restent disponibles pour les erreurs réseau transitoires.

L'acceptation d'une demande de code d'appareil par Microsoft valide seulement le début du parcours. La connexion complète exige aussi l'acceptation par Xbox et Minecraft Services, puis la récupération du profil du joueur. Un test arrêté par une limitation 429 ne constitue pas une connexion complète réussie.

## Autorisation Minecraft et modes conservés

L'essai de l'ancien APK utilisant l'inscription propre à Yapapouaiye s'est arrêté avec **HTTP 403**. Le journal du launcher contenait **Invalid app registration** pour Minecraft Services. Cette inscription permet de franchir Microsoft et Xbox mais reste refusée par Minecraft. Le nouveau parcours compatible PC doit être validé séparément ; il ne change pas l'état d'approbation de l'inscription propre à Yapapouaiye.

Le [formulaire officiel AppID Review](https://aka.ms/mce-reviewappid), consulté le 27 octobre 2026, précise que les applications doivent authentifier l'utilisateur et vérifier sa possession du jeu avant d'en permettre l'utilisation. Les applications permettant de contourner ces contrôles ne sont pas approuvées, indépendamment du réglage des serveurs.

L'utilisateur a explicitement choisi de **conserver le mode pseudo hors ligne et le mode Microsoft**. Le mode hors ligne n'a donc pas été supprimé ni transformé en accès soumis à Microsoft. Le fonctionnement actuel entre en conflit avec les critères du formulaire pour une nouvelle inscription ; aucune approbation de cette inscription n'est annoncée. Le mode Microsoft conserve la vérification des réponses de Microsoft, Xbox et Minecraft, ainsi que la vérification du profil et de la licence.
