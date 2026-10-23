# QR Chantier — Netlify + Airtable

Le QR du panneau pointe vers `https://TON-SITE.netlify.app/c/<slug>` : fiche projet + intervenants groupés (même logique que Viaco), aux couleurs Legendre (logo dans `public/logo.png`).
Saisie via `/admin.html` (login protégé).

## 1. Airtable : 2 tables (noms de champs exacts, sensibles à la casse)

**Chantiers**
| Champ | Type |
|---|---|
| Slug | Texte (ex. `clinique-du-parc`, minuscules/tirets) |
| Nom | Texte |
| Surface | Texte (ex. `9 981 m² SDP`) |
| Usage | Texte |
| Adresse | Texte |
| ImageUrl | URL |
| Description | Texte long |
| LienRejoindre | URL (optionnel) |
| DateDebut | Date (format ISO) |
| DateFin | Date (format ISO) |
| Horaires | Texte long |
| Actif | Case à cocher |

**Intervenants**
| Champ | Type |
|---|---|
| Slug | Texte (= slug du chantier) |
| Entreprise | Texte |
| Groupe | Texte (Maître d'ouvrage, Maîtrise d'œuvre, Lot 3 - Gros-œuvre…) |
| Role | Texte (mandataire, co-traitant…) |
| Adresse | Texte |
| Telephone | Texte |
| Email | Texte (optionnel) |
| SiteWeb | URL |
| LogoUrl | URL |
| Ordre | Nombre |

Les images/logos : champs URL (https). N'utilise pas les pièces jointes Airtable : leurs liens expirent au bout de quelques heures.

Token : airtable.com/create/tokens → scopes `data.records:read` + `data.records:write`, limité à cette base.
Base ID : dans l'URL (`appXXXX`).

## 2. Netlify

1. Dossier sur GitHub → Netlify *Add new site → Import from Git* (ou `netlify deploy --prod`).
2. Site settings → Environment variables : les 4 variables de `.env.example`.
3. Redéploie.

## 3. Utilisation

- `/admin.html` → connexion → l'admin crée le chantier, la personne de saisie ajoute les entreprises.
- Bouton « Télécharger l'affiche » : PNG 1414×2000 avec le QR, prêt à imprimer pour le panneau.

## Sécurité

- Token Airtable côté serveur uniquement.
- Sessions signées HMAC, 12 h. Mots de passe ≥ 14 caractères.
- L'endpoint public ne renvoie que les champs affichés, pour les chantiers `Actif`.
- Pas de vraie limitation de débit sur le login (délai de 400 ms).
- Données publiques : noms, adresses, téléphones. Contacts pros uniquement.
