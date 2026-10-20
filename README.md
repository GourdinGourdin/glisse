# Glisse (nom provisoire)

Plateforme de réservation et de gestion pour les écoles de surf, de voile et, à terme, d'autres sports encore peu digitalisés.

## Le problème

- **Côté pratiquants** : pour s'inscrire à un cours de surf ou de voile, il faut encore souvent téléphoner ou se déplacer sur place. Les infos (plages, niveaux, écoles disponibles) sont éparpillées.
- **Côté écoles** : la gestion se fait sur Excel, sur papier et par téléphone. Difficile de suivre les effectifs, de remplir les créneaux et de se rendre visible.

## La solution

| Pratiquants | Écoles |
|---|---|
| Réserver un cours en ligne en quelques clics | Logiciel clé en main, sans Excel ni papier |
| Infos sur les plages / spots | Planning des cours et des moniteurs |
| Niveau associé à chaque cours | Gestion automatique des inscrits et des places |
| Comparer les écoles disponibles | Visibilité auprès de nouveaux clients |

## Structure du dossier

```
glisse/
├── landing/      # Page lead magnet (HTML/CSS/JS statique, pas de build)
├── app/          # Future application (à initialiser)
└── docs/         # Vision produit, roadmap, notes
```

## Lancer la landing page

Ouvre directement `landing/index.html` dans le navigateur, ou lance un petit serveur local :

```bash
cd landing && python3 -m http.server 8000
# puis http://localhost:8000
```

Avec VS Code, l'extension **Live Server** fonctionne aussi (clic droit sur `index.html` → *Open with Live Server*).

## Collecte des emails

Le formulaire est prêt mais n'est pas encore relié à un service. Pour le brancher, mets l'URL de ton endpoint (Formspree, Tally, Brevo, Supabase…) dans `FORM_ENDPOINT` en haut de `landing/script.js`. Tant que la variable est vide, les inscriptions sont seulement affichées dans la console.

Les leads arrivent avec les réponses au diagnostic et le résultat calculé. Pour afficher un lien de prise de rendez-vous aux écoles, renseigne `DEMO_URL` (Calendly, Cal.com…) dans le même fichier.

## Prochaines étapes

Voir [docs/roadmap.md](docs/roadmap.md).
