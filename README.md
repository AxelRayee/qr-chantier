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
- Connexion des gestionnaires par identifiant **ou** e-mail (si un même e-mail a plusieurs chantiers, on choisit le chantier). Avec Brevo actif, une invitation créée avec un e-mail est envoyée automatiquement.
- Champ `CA` (Chantiers, devise €) : chiffre d'affaires € HT, visible et modifiable par l'admin uniquement, jamais publié.
- `BREVO_API_KEY` + `MAIL_FROM` (optionnels) : envoi automatique des e-mails « mot de passe oublié » / « identifiant oublié » via Brevo. `MAIL_FROM` doit être une adresse expéditrice validée dans Brevo. `MAIL_FROM_NAME` (optionnel) : nom de l'expéditeur. `SITE_URL` (optionnel) : adresse du site dans les liens envoyés (sinon la variable `URL` fournie par Netlify).
  `ALERT_EMAIL` (optionnel) : destinataire du bilan mensuel (sinon `MAIL_FROM`). La fonction planifiée `veille` envoie ce bilan le 1er de chaque mois : elle garde la clé Brevo active (Brevo supprime une clé inutilisée 90 jours). Bouton admin « ✉️ Tester l'e-mail » pour vérifier l'envoi à tout moment.
  Sans ces variables, une demande d'oubli est signalée à l'administrateur (badge « a demandé de l'aide ») qui génère un lien « nouveau mot de passe » à transmettre lui-même.

## 3. Protection des données (RGPD)

- Les pages publiques n'affichent que des coordonnées **professionnelles** : standard, adresse de l'entreprise, e-mail générique. Pas de mobile ni d'e-mail personnel.
- Les identifiants et e-mails des gestionnaires ne sont **jamais** publics.
- Les pages ne sont pas indexées par les moteurs de recherche. Le slug des chantiers contient un suffixe aléatoire (ex. `merignac-x7k2`) pour ne pas être devinable.
- Comptes : lien de réinitialisation à usage unique (1 h par e-mail, 72 h par l'admin), seule son empreinte est stockée ; changer de mot de passe déconnecte les autres sessions (champ `Version`). Champs Airtable ajoutés à `Utilisateurs` : `ResetHash`, `ResetExpire`, `ResetDemande`, `Version`.
- Renseigner `CONTACT_RGPD` pour offrir un moyen de demander rectification/suppression ; informer les gestionnaires et entreprises de l'affichage de leurs coordonnées.
- Fin de chantier : décocher « Page publique active » ou supprimer le compte du gestionnaire.
