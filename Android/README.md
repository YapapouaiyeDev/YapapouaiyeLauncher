# Yapapouaiye Launcher Android

Application Android **8+ ARM64**, avec le moteur tactile personnalisé [Android/moteur](moteur/README.md), ses menus et ses réglages Yapapouaiye. Le noyau Java des entrées et la vue Android sont propres à ce projet. La compatibilité nécessaire pour exécuter Minecraft Java utilise encore **Fold Craft Launcher, OpenJDK et LWJGL** ; cette version ne prétend pas réimplémenter une JVM ou le rendu de Minecraft. Java 8/17/21/25 est inclus. La version Android vient de `version.json` dans ce dossier et suit la série `1.0.0-A`, indépendante de la version PC. Son `versionCode` doit toujours augmenter pour permettre les mises à jour des installations existantes.

## Installer et jouer

1. Installer `dist/Yapapouaiye-Android-<version>-arm64.apk` sur le téléphone. Une mise à jour d’un ancien APK exige la même clé de signature : conserver et réutiliser le `debug.keystore` de la machine de compilation originale. Une nouvelle clé ne permet pas de remplacer l’installation existante.
2. Accorder les autorisations nécessaires et accepter les conditions du moteur. Les runtimes sont préparés automatiquement.
3. Choisir un serveur provenant de **https://yapapouaiye-launcher.pages.dev/api/servers**. Seuls les serveurs activés dans ce catalogue sont proposés. **Actualiser** recharge le catalogue.
4. Saisir les codes si le serveur en exige. Ils sont vérifiés par l’API et restent uniquement en mémoire pendant cette session.
5. Choisir **Compte Microsoft officiel** pour se connecter ou sélectionner un compte Minecraft Java enregistré, ou **Pseudo hors ligne (crack)** pour les serveurs qui acceptent ce mode. Le launcher ne remplace plus le compte Microsoft par un compte hors ligne au lancement.
6. Appuyer sur **Jouer** : Minecraft, le loader et les mods sont préparés, puis le jeu rejoint le serveur choisi. L’ouverture du catalogue et le changement de serveur ne déclenchent plus d’installation, ce qui laisse le temps de choisir son compte. Les codes peuvent être vérifiés et le jeu préparé séparément avec leur bouton.

Le mode pseudo crée un compte Offline. AdoServSE accepte ce mode ; un autre serveur peut exiger un compte officiel ou imposer ses propres conditions. La sélection dans le catalogue ne change pas ses règles.

La mémoire peut être automatique ou manuelle. **Configurer et essayer mes commandes** ouvre les réglages Yapapouaiye, avec sensibilité, taille, opacité, résolution et disposition gaucher. Le banc d’essai permet d’essayer et de déplacer les touches sans lancer Minecraft. Aucun panneau de réglages FCL n’est ouvert par ce bouton.

La connexion Microsoft utilise par défaut le même client public que la bibliothèque du launcher PC, avec son parcours par navigateur et retour contrôlé dans l'app. `microsoft.json` conserve aussi l'identifiant propre au launcher, dont l'autorisation Minecraft reste distincte ; `OAUTH_API_KEY` permet de remplacer le client actif à la compilation. Le joueur n'a aucun identifiant d'application à saisir. Les anciennes préférences locales ne peuvent pas remplacer le client intégré. Sans identifiant valide, le bouton est désactivé. Les détails des deux parcours et les limites de validation sont dans [MICROSOFT.md](MICROSOFT.md).

## Interface, contrôles et fluidité

Les paramètres proposent **Mes réglages Minecraft** (par défaut, aucun écrasement), **Équilibré** (10 chunks, simulation 5, maximum 60 FPS) et **Fluidité** (6 chunks, simulation 5, maximum 60 FPS, graphismes rapides, particules minimales et ombres des entités désactivées). Les profils sont appliqués au prochain lancement. Les autres options et les touches sont préservées. Le premier `options.txt` est sauvegardé dans `options-before-yapapouaiye.txt`. Revenir à Mes réglages cesse d’imposer le profil ; cela ne restaure pas automatiquement la sauvegarde. Le bouton **Profil Fluidité** des commandes choisit également une résolution de 75 %. Les anciennes valeurs de luminosité hors de l’intervalle 0–1 sont réparées même avec Mes réglages Minecraft ; le compagnon Android 26.2 borne aussi les nouvelles écritures de FullBright pour éviter les erreurs répétées à chaque tick.

**Commandes → Moteur graphique** permet de choisir Automatique, Zink ou Krypton au prochain lancement. Automatique choisit Zink pour Minecraft 26.2 et Krypton pour les autres versions. Zink utilise le pilote Vulkan système ; la disponibilité du matériel et du pilote reste nécessaire.

**Commandes → Manette · sensibilité et boutons** associe chacun des 16 boutons Xbox / PlayStation à une des 24 actions, ou à Aucune action. Appuyer sur un bouton physique sélectionne sa ligne. Appliquer sauvegarde le profil commun aux manettes ; Annuler conserve les valeurs précédentes. Les actions suivent les touches enregistrées dans Minecraft. Le stick gauche garde le déplacement et le stick droit la caméra. Deux boutons affectés à la même action ne se relâchent pas mutuellement ; les maintiens sont libérés à la fermeture du menu, à la perte de focus et à la déconnexion.

La sensibilité du stick droit se règle de **25 à 2 000 %**, avec **300 % par défaut**. 100 % correspond à l'ancienne vitesse et 2 000 % à vingt fois cette vitesse, avant application de la sensibilité interne de Minecraft. Le réglage prend effet dès Appliquer en partie, sans relancer le jeu. Il est indépendant de la caméra tactile et ne multiplie pas la vitesse du curseur des menus. La rotation dépend du temps écoulé, avec un plafond de 100 ms pour un échantillon retardé afin d'éviter un grand saut après un blocage.

Pour une touche précise, choisir un bouton de manette puis **Touche clavier…**. Le sélecteur accepte le nom d'une touche (G, F6, Espace, Ctrl droit…), une sélection dans la liste ou **Capturer une touche** depuis un clavier physique. Lettres, chiffres, F1–F12, modificateurs, flèches, navigation, ponctuation et pavé numérique sont proposés. Une touche personnalisée envoie directement cette touche, même si les raccourcis Minecraft ont été modifiés. Le maintien et le relâchement suivent le bouton de manette ; l'affectation n'est sauvegardée qu'avec Appliquer dans le panneau principal. Annuler ne remplace pas le profil enregistré. Le launcher enregistre la touche choisie, jamais le texte de recherche.

En partie, **Y · Menu → Touche clavier…** ouvre aussi ce sélecteur pour envoyer un appui ponctuel au jeu, sans affecter de bouton de manette. L'envoi attend le retour du focus de Minecraft puis relâche la touche ; pause et perte de focus annulent un envoi en attente.

**Y · Menu → Mes boutons à l'écran**, ou le bouton du même nom dans les réglages des commandes, permet de créer jusqu'à 12 boutons d'écran : nom, touche clavier, modification et suppression. **Toujours affiché** les conserve avec une manette et dans les menus ; **Tactile uniquement** les masque lorsqu'une manette est connectée. **Déplacer les touches** permet ensuite de les placer. Un bouton NexLux, affecté à **Maj droite**, est fourni par défaut en mode Toujours affiché. Si cette touche a été changée dans Minecraft, modifier le bouton pour utiliser la nouvelle touche. La touche est tenue pendant le contact et relâchée sur sortie, annulation ou perte de focus. Les appuis communs à la manette et au tactile ne se relâchent qu'avec leur dernier propriétaire.

Le curseur virtuel est automatiquement caché quand Minecraft capture la vue en partie. **Masquer le curseur virtuel, même dans les menus** permet de le cacher aussi dans les menus ; l’option est désactivée par défaut. Les événements tactiles restent actifs. L’aide intégrée explique le déplacement, la caméra, les menus et le retour au launcher. Le WebView est mis en pause lorsque le launcher passe en arrière-plan.

Le nouveau moteur remplace le joystick et les touches FCL à chaque lancement. Les anciens contrôleurs restent sur disque. Le joystick n’a aucun verrouillage automatique ; Accroupi et Courir fonctionnent uniquement pendant l’appui. Un doigt qui se relève libère ses propres touches même si d’autres doigts restent posés. Annulation Android, perte de focus, pause, changement de mode Minecraft et ouverture du menu relâchent les commandes. Le menu **Y · Menu** propose Reprendre, Pause Minecraft, Clavier, Réglages, Déplacer les touches et Aide. Une nouvelle installation Minecraft commence en français ; la langue existante est préservée.

Une manette physique masque automatiquement les commandes tactiles standard, y compris dans les menus. Les boutons personnalisés en mode Toujours affiché restent visibles. **Y · Menu** reste accessible pour la pause, la saisie et les réglages ; débrancher la dernière manette rétablit les touches. Le banc d’essai et l’édition des commandes gardent leurs boutons visibles. Chat ouvre une saisie Android avec **Envoyer** ; le texte est envoyé après ouverture du chat et retour du focus du jeu. Dans un formulaire, toucher son champ puis **Clavier**. Les flèches des menus envoient la molette. Le menu propose également **Valider (Entrée)**, **Espace** et une bascule **Mode tactile : menus** pour changer les commandes affichées.

Avec NeoForge 26.2 et 1.21.1, le petit mod client **Yapapouaiye Android Controls** permet d’ouvrir le chat depuis l’écran de mort avec **Chat** ou **Y · Menu → Chat en étant mort (/login)**. La fermeture du chat restitue l’écran de mort si le joueur est encore mort, ce qui permet de réessayer Réapparaître. Le mot de passe du serveur reste à saisir par le joueur ; le launcher ne contourne pas son authentification. Sources, compilation et tests du mod : `companion/` et `build-companion.ps1`. Il est distinct de NexLux et n’altère pas les JAR du launcher PC.

## Mises à jour Android

À chaque ouverture, le launcher recherche les APK dans les 100 dernières releases GitHub du dépôt YapapouaiyeDev/YapapouaiyeLauncher. Les stables ignorent les préversions ; une bêta peut recevoir une bêta plus récente ou une stable. Seuls les fichiers `Yapapouaiye-Android-<version>-<architecture>.apk` avec une empreinte `digest` SHA-256 GitHub sont proposés. Une release PC sans APK compatible ne produit aucune proposition Android.

Le téléchargement automatique est activé par défaut sur un réseau qu’Android considère non facturé ; il est désactivable. Le téléchargement manuel reste possible sur réseau mobile. La taille, le SHA-256, l’identité Android, la version et le certificat de signature sont vérifiés. L’APK reste dans le cache privé et est partagé uniquement avec l’installateur Android. **Installer la mise à jour** demande, si nécessaire, l’autorisation d’installer des applications depuis ce launcher, puis ouvre la confirmation système. Une installation silencieuse n’est pas disponible. Aucun APK officiel FCL ne peut remplacer cette application. Il faut publier l’APK signé avec la même clé pour rendre une mise à jour disponible.

Une bannière sur l’accueil signale la mise à jour et donne accès à son installation. Les tests d’interface s’exécutent avec `node --test tests/home.test.cjs` depuis `Android/`, avec Playwright et Microsoft Edge disponibles (`NODE_PATH` peut pointer vers les dépendances partagées).

Depuis `1.0.2-A`, un APK déjà téléchargé est revérifié et réutilisé au redémarrage : il n'est plus nécessaire de le télécharger à nouveau après une fermeture ou une recréation de l'écran. L'installation revérifie aussi l'empreinte avant d'ouvrir Android. Le retour des paramètres d'autorisation reprend la demande d'installation lorsque celle-ci a été autorisée. Les erreurs distinguent changement de package, signature incompatible, version incorrecte, APK incomplet/corrompu et limitation GitHub. La validation de l'identité et de la signature reste obligatoire.

## Catalogue et mods

Le catalogue détermine le nom, l’adresse, le **gamePort** (distinct du port de ping), Minecraft, le loader et les codes requis. NeoForge, Fabric, Forge et Vanilla sont reconnus ; une version stable disponible du loader est résolue auprès de son fournisseur. Une configuration invalide bloque le lancement avec un message d’erreur.

À chaque préparation, les serveurs activés sont aussi fusionnés dans le `servers.dat` du profil Minecraft : ils apparaissent dans **Multijoueur**, même après une déconnexion. Les entrées personnelles et leurs métadonnées sont conservées ; le premier fichier existant est sauvegardé sous `servers.dat.yapapouaiye.bak`. Chaque serveur exige toujours sa version de Minecraft, ses mods et ses éventuels codes. Une ancienne adresse contenant déjà un port est normalisée pour utiliser une seule fois `gamePort`, y compris en IPv6.

Avant chaque préparation et à sa fin, le launcher vérifie le catalogue, la maintenance et l’accès. Une API indisponible bloque la préparation et le lancement. Un serveur supprimé ou désactivé ne peut pas être lancé. Chaque clic sur Jouer vérifie les fichiers et l’accès ; la sélection est verrouillée pendant l’installation ou une partie.

Les mods sont téléchargés **en direct**, via `POST /api/android-mods`, depuis les mêmes dépôts que le launcher PC : Gitea pour les serveurs avec dépôt configuré, Backblaze B2 pour AdoServ LXVII. Les secrets restent dans les bindings Cloudflare et ne figurent ni dans l’APK ni dans les réponses du catalogue. L’API vérifie maintenance, serveur et codes pour chaque fichier. Seuls les JAR du dépôt configuré sont servis ; le client ne fournit aucune URL arbitraire.

Empreintes Git SHA-1 ou B2 MD5 et tailles sont contrôlées au téléchargement, puis les fichiers sont vérifiés en SHA-256 lors de la synchronisation. Le cache valide est réutilisé. NexLux est ajouté pour NeoForge 1.21.1 et 26.2 avec la version du projet ; il n’est pas ajouté à Fabric, Forge ou Vanilla.

Les profils sont séparés par serveur dans le stockage privé externe : `servers/<id>/`, avec conservation de l’ancien emplacement `adoservse/`. Chaque version reste isolée par FCL. Les mods remplacés sont sauvegardés dans `.yapapouaiye-backups/`. Seuls les anciens mods gérés et inchangés sont retirés ; un ancien mod modifié est conservé et bloque le lancement pour signaler le conflit. Les fichiers personnalisés, configurations et mondes sont préservés. Une annulation attend le nettoyage du moteur avant de libérer l’installation.

Un nouveau serveur avec un dépôt Gitea configuré apparaît sans nouvel APK. Une autre source privée doit d’abord être prise en charge côté API ; une source absente produit une erreur au lieu de lancer sans les mods attendus.

## Firebase et identité Android

La version `1.0.1-A` utilise le package **`com.voyzix.yla`**, défini dans `application.json`, correspondant au client enregistré dans `google-services.json`. Le fichier fourni est conservé sans réécriture et copié dans le module d'application lors de chaque préparation. Le plugin Google Services `4.5.0` génère les ressources ; le SDK Analytics est inclus avec Firebase BoM `35.1.0`, avec initialisation automatique au premier démarrage. La collecte de l'identifiant publicitaire est désactivée.

L'ancien APK `1.0.0-A` utilisait `fr.yapapouaiye.launcher.android.debug`. Android considère donc cette version comme une **nouvelle application**, qui peut coexister avec l'ancienne. Les comptes et réglages privés de l'ancienne application ne sont pas automatiquement transférés. Conserver l'ancienne installation pour garder accès à ces données.

Le build refuse un fichier Firebase d'un autre package ou un identifiant d'application Firebase incohérent. `verify-apk.ps1` vérifie l'identité finale, les ressources Firebase et son fournisseur d'initialisation dans l'APK signé. Le fichier contient la configuration publique du client Android, pas de compte de service ni de clé privée. Les services Firebase supplémentaires nécessitent leur propre intégration ; ce fichier ne fournit pas une certification de l'APK.

## Compilation et API

Prérequis : Windows, Git, Node.js, JDK 17/21, SDK Android 35, build-tools, NDK `27.0.12077973`, CMake `3.22.1`.

```powershell
.\build.ps1 -SdkDirectory 'C:/chemin/Android/Sdk'
.\export-source.ps1
```

Aucun cache PC ni identifiant de stockage n’est nécessaire pour compiler. `patch-upstream.cjs` restaure les fichiers de la révision FCL verrouillée par `upstream.json` puis applique les adaptations. `build.ps1` exécute les tests ciblés, compile et vérifie signature, identité, version, interface, runtimes et compagnons. Conserver la clé de développement locale pour les mises à jour. Android est exclu des builds Windows. Aucun APK FCL officiel n’est proposé comme mise à jour.

L’API est dans `../site/functions/api/android-mods.js` et ses fournisseurs dans `../site/functions/_lib/android-mods.js`. Ses secrets sont décrits dans `../site/.dev.vars.example` et configurés avec Wrangler côté Pages en production. Aucun secret ne doit être inscrit dans les sources ou un fichier public. `npm test` dans `site/` vérifie téléchargements, codes, maintenance, désactivation et chemins. L’API est déployée sur le projet existant `yapapouaiye-launcher`.

## Sources et validation

Adaptations GPL-3.0-or-later ; moteur sous `LICENSE-FCL`. Source amont : [Fold Craft Launcher](https://github.com/FCL-Team/FoldCraftLauncher), révision `cd14d179ce22a806c9eda6353836e5abfa93cf30`. Les dépendances et mods gardent leurs licences. Fournir `dist/Yapapouaiye-Android-sources.zip` avec l’APK lors d’un partage ; l’archive contient les sources adaptées et les notices.

Les tests du catalogue couvrent loaders, ports, serveurs désactivés, doublons, chemins et champs invalides et codes. Les tests de synchronisation couvrent réparation, sauvegarde, fichiers personnalisés, corruption, chemins, obsolescence et inventaire Vanilla vide. `dist/interface-yapapouaiye.png` montre l’interface dans un navigateur avec une simulation du pont Android.

Le noyau des entrées et les scénarios Android sont décrits dans [moteur/VALIDATION.md](moteur/VALIDATION.md). Les tests de la vue sur téléphone utilisent un banc simulé : ils ne valident pas une partie Minecraft, une connexion à un serveur ni les performances. Ces vérifications en jeu restent nécessaires.

Depuis `1.0.2-A`, les axes de la manette sont appliqués ensemble après chaque événement Android. Le déplacement conserve les touches communes lors des changements de direction, avec une légère hystérésis contre le bruit du stick. La caméra avance une fois par image Android, avec son horloge d'affichage, plutôt qu'à chaque changement d'axe. Les protections de pause, perte de focus et déconnexion restent actives. Les tests vérifient le maintien sur 1 000 échantillons et la rotation continue sans nouveaux événements ; la fluidité réelle dépend aussi du rendu Minecraft et reste à vérifier en jeu.
