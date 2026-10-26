# QR Chantier — Netlify + Airtable

Le QR du panneau pointe vers `https://TON-SITE.netlify.app/c/<slug>` : fiche projet + intervenants groupés, aux couleurs Legendre.
Saisie via `/admin.html` (connexion protégée).

## Fonctionnement des accès

| Qui | Comment il obtient l'accès | Ce qu'il peut faire |
|---|---|---|
| **Admin** (toi) | Compte défini dans la variable Netlify `ADMIN_USERS` | Créer les chantiers, générer le QR, inviter et désactiver des gestionnaires |
| **Gestionnaire** (ex. Erwan) | Lien d'invitation unique envoyé par l'admin, il crée lui-même son compte | Modifier les infos et les intervenants de **son seul chantier** |
| **Public** | Scan du QR | Lire la page du chantier (rien d'autre) |

Parcours : l'admin crée le chantier → télécharge l'affiche QR → clique « Créer le lien d'invitation » → envoie le lien à la personne → elle choisit identifiant + e-mail + mot de passe → elle complète le chantier.

Protections : lien à usage unique et à durée limitée (jeton jamais stocké en clair), possibilité d'imposer l'e-mail du destinataire, mots de passe hachés (scrypt), verrouillage 15 min après 5 échecs, droits revérifiés à chaque action, accès coupé 30 jours après la date de fin du chantier, désactivation immédiate par l'admin.

## 1. Airtable : 4 tables (noms de champs exacts, sensibles à la casse)

**Chantiers** : Slug, Nom, Surface, Usage, Adresse, ImageUrl, Description, LienRejoindre, DateDebut (date), DateFin (date), Horaires, Actif (case à cocher).

**Intervenants** : Entreprise, Slug, Groupe, Role, Adresse, Telephone, Email, SiteWeb, LogoUrl, Ordre (nombre).

**Utilisateurs** (créée automatiquement par les liens d'invitation, ne pas modifier à la main) : Identifiant, Email, Slug, Role, Sel, Hash, Actif, Expire (date, optionnel), Echecs, VerrouJusqua.

**Invitations** (idem) : Jeton, Slug, Note, EmailInvite, Expire, Utilisee, UtilisePar, Revoquee.

Token Airtable : airtable.com/create/tokens → `data.records:read` + `data.records:write`, limité à cette base.

## 2. Netlify : variables d'environnement

- `AIRTABLE_BASE_ID`, `AIRTABLE_TOKEN`
- `AUTH_SECRET` : chaîne aléatoire de 40+ caractères
- `ADMIN_USERS` : `{"raye":{"pass":"…","role":"admin"}}` (admin uniquement)
- `CONTACT_RGPD` (optionnel) : adresse affichée en bas des pages publiques

## 3. Protection des données (RGPD)

- Les pages publiques n'affichent que des coordonnées **professionnelles** : standard, adresse de l'entreprise, e-mail générique. Pas de mobile ni d'e-mail personnel.
- Les identifiants et e-mails des gestionnaires ne sont **jamais** publics.
- Les pages ne sont pas indexées par les moteurs de recherche. Le slug des chantiers contient un suffixe aléatoire (ex. `merignac-x7k2`) pour ne pas être devinable.
- Renseigner `CONTACT_RGPD` pour offrir un moyen de demander rectification/suppression ; informer les gestionnaires et entreprises de l'affichage de leurs coordonnées.
- Fin de chantier : décocher « Page publique active » ou supprimer le compte du gestionnaire.
