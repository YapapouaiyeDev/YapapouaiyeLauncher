# Invitations au launcher

La première connexion exige une invitation, y compris sur les installations qui
avaient déjà terminé l’ancien assistant sans invitation. Une validation réussie
est conservée localement par le launcher (Electron et Tauri). Changer de compte
ou rouvrir l’assistant ne demande pas un nouveau code.

Avant de distribuer cette version du launcher :

1. Configurer les secrets serveur `ADMIN_PASSWORD` et `ADMIN_TOKEN_SECRET` avec
   des valeurs privées. Les identifiants de développement publics sont refusés
   pour la gestion des invitations. Appliquer `migrations/invitations/0001_create_invitations.sql`
   à la base D1 dédiée `yapapouaiye-launcher-invitations`, puis déployer le site.
2. Dans `admin-dashboard.html`, rubrique **Codes d’invitation**, renseigner le
   nom de l’invité et choisir un code de 8 à 128 caractères, ou laisser le champ
   vide pour obtenir un code aléatoire. Le code est sensible à la casse ; les
   espaces en début et fin sont ignorés.
3. Copier le code affiché à sa création et le transmettre à l’invité. Seule son
   empreinte SHA-256 est enregistrée sur le serveur, il ne peut pas être relu.

Chaque code autorise une seule installation. En cas de réponse réseau perdue,
la même installation peut reprendre sa validation avec le même code. Pour une
réinstallation avec suppression des données ou un autre ordinateur, créer une
nouvelle invitation. Révoquer un code disponible empêche sa validation ; les
accès déjà accordés restent acquis.

Un code incorrect, révoqué ou utilisé bloque les essais pendant 10 secondes.
Le serveur applique le délai par adresse IP, avec un verrou atomique en base D1
pour les requêtes simultanées. Le launcher conserve également le délai sur
disque pour les redémarrages. Une panne serveur ne donne aucun accès.

L’API utilisée est `/api/invitation-verify` sur le site de production ; les builds
de développement utilisent `http://127.0.0.1:8789`. `LAUNCHER_SITE_API` permet
d’utiliser une autre instance. Aucun code valide n’est inclus dans le launcher.

Pour le développement local, copier `site/.dev.vars.example` vers `site/.dev.vars`
et définir les secrets privés avant de démarrer le site. Appliquer la migration
à la base D1 locale. Ce fichier de secrets est exclu de Git.

La liaison `INVITATIONS_DB` est réservée aux invitations. Les actualités de
production restent dans le bucket R2 existant. `npm run deploy` construit le
dossier public dans `.wrangler/publish` et publie sur la branche de production
`main`. Les sources des fonctions, tests et fichiers de configuration ne sont
pas copiés parmi les fichiers publics.

Cette invitation contrôle l’accès dans le launcher officiel. L’admission locale
et le client restent sous le contrôle du propriétaire du PC ; pour interdire
des connexions Minecraft depuis un autre client, utiliser aussi l’autorisation
du serveur Minecraft (par exemple sa whitelist).
