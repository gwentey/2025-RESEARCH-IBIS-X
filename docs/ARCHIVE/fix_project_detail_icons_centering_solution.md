# Fix: Centrage des icônes Material dans les cartes de la page projet

## Problème identifié

Sur la page de détail d'un projet (`http://localhost:8080/app/projects/[id]`), les icônes Material utilisant la directive `mat-card-avatar` n'étaient pas centrées correctement dans les headers des cartes.

## Icônes concernées

Les icônes suivantes présentaient des problèmes de centrage :
- Icône "settings" dans la carte Configuration 
- Icône "insights" dans la carte Recommandations/Statistiques
- Icône "star" dans la carte Top 3 des Recommandations

## Solution appliquée

### Fichier modifié
- `frontend/src/app/pages/projects/project-detail.component.scss`

### Corrections CSS

1. **Pour les cartes Configuration et Statistiques** (`.config-card, .stats-card`) :
```scss
mat-card-header {
  .mat-icon {
    background: #f0f4ff;
    color: #1976d2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 20px;
  }
}
```

2. **Pour la carte Top 3 des Recommandations** (`.top-recommendations-card`) :
```scss
mat-card-header {
  .mat-icon {
    background: #fff3e0;
    color: #f57c00;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 20px;
  }
}
```

## Propriétés CSS utilisées pour le centrage

- `display: flex` : Active le modèle de boîte flexible
- `align-items: center` : Centre l'icône verticalement
- `justify-content: center` : Centre l'icône horizontalement  
- `width: 40px; height: 40px` : Taille fixe pour cohérence
- `border-radius: 50%` : Crée l'arrière-plan circulaire
- `font-size: 20px` : Ajuste la taille de l'icône

## Validation

- ✅ Aucune erreur de linting détectée
- ✅ Les icônes sont maintenant parfaitement centrées
- ✅ Cohérence visuelle maintenue avec les couleurs Material Design
- ✅ Différenciation visuelle entre les types de cartes (bleu pour config/stats, orange pour recommandations)

## Impact

Cette correction améliore l'expérience utilisateur en assurant un alignement visuel professionnel des éléments d'interface sur la page de détail des projets.
