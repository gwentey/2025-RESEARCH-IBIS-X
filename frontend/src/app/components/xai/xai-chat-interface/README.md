# Interface de Chat XAI

## Vue d'ensemble

Le composant `XAIChatInterfaceComponent` fournit une interface de chat moderne et interactive permettant aux utilisateurs de poser des questions sur leurs explications XAI. Il s'intègre parfaitement avec le backend XAI et utilise GPT-5 Nano pour générer des réponses contextuelles.

## Fonctionnalités

- 🤖 **Chat Intelligence Artificielle**: Powered by GPT-5 Nano
- 🌐 **Multilingue**: Support français et anglais
- 📊 **Contextuel**: Comprend automatiquement l'explication en cours
- 🚀 **Moderne**: Design Linear/Stripe avec animations fluides
- 📱 **Responsive**: Optimisé mobile et desktop
- 🎯 **Suggéré**: Questions pré-remplies pour commencer
- ⚡ **Temps réel**: Indicateurs de frappe et statuts en direct

## Utilisation

### Import du Composant

```typescript
import { XAIChatInterfaceComponent } from './xai-chat-interface/xai-chat-interface.component';

@Component({
  // ...
  imports: [XAIChatInterfaceComponent]
})
```

### Intégration Basique

```html
<app-xai-chat-interface 
  [explanationId]="explanationId"
  [maxQuestions]="5">
</app-xai-chat-interface>
```

### Intégration Complète

```html
<app-xai-chat-interface 
  [explanationId]="explanationId"
  [maxQuestions]="10"
  [language]="currentLanguage"
  [compactMode]="isCompactView">
</app-xai-chat-interface>
```

## Propriétés d'Entrée (Inputs)

| Propriété      | Type    | Défaut | Description                                    |
|----------------|---------|--------|------------------------------------------------|
| `explanationId`| string  | -      | **Requis.** ID de l'explication XAI          |
| `maxQuestions` | number  | 5      | Nombre maximum de questions par session       |
| `language`     | string  | 'fr'   | Langue du chat ('fr' ou 'en')                |
| `compactMode`  | boolean | false  | Mode compact pour espaces restreints          |

## États et Comportements

### États de Chargement

1. **Initialisation**: Création de la session de chat
2. **Actif**: Prêt à recevoir des questions
3. **En cours**: Traitement d'une question
4. **Limite atteinte**: Plus de questions autorisées

### Questions Suggérées

Le composant propose automatiquement des questions pertinentes :
- Importance des variables
- Interprétation business
- Limites du modèle
- Suggestions d'amélioration
- Fiabilité des résultats

### Gestion des Erreurs

- **Erreur de connexion**: Bouton de réessai automatique
- **Limite de questions**: Message informatif avec redirection
- **Erreur de session**: Possibilité de recommencer

## Exemples d'Usage

### Intégration dans une Page de Résultats

```typescript
// component.ts
export class ResultsComponent {
  explanationId = 'exp-12345';
  isCompactMode = false;
  currentLanguage = 'fr';
  
  onChatComplete() {
    // Action après utilisation du chat
  }
}
```

```html
<!-- template.html -->
<div class="results-container">
  <!-- Résultats principaux -->
  <div class="main-results">
    <!-- ... contenu des résultats ... -->
  </div>
  
  <!-- Section Chat -->
  <div class="chat-section">
    <h2>Questions sur cette Explication</h2>
    <app-xai-chat-interface 
      [explanationId]="explanationId"
      [maxQuestions]="5"
      [language]="currentLanguage"
      [compactMode]="isCompactMode">
    </app-xai-chat-interface>
  </div>
</div>
```

### Mode Compact pour Sidebar

```html
<div class="sidebar">
  <app-xai-chat-interface 
    [explanationId]="currentExplanationId"
    [maxQuestions]="3"
    [compactMode]="true"
    [language]="'fr'">
  </app-xai-chat-interface>
</div>
```

## Configuration du Service Backend

Le composant utilise `XAIService` pour communiquer avec le backend. Assurez-vous que les endpoints suivants sont configurés :

```typescript
// Configuration requise dans XAIService
const endpoints = {
  createChatSession: '/api/v1/xai/explanations/{id}/chat',
  askQuestion: '/api/v1/xai/explanations/chat/{sessionId}/ask',
  getChatMessages: '/api/v1/xai/explanations/chat/{sessionId}/messages'
};
```

## Styles et Personnalisation

### Variables CSS Disponibles

```scss
// Couleurs principales
--xai-chat-primary: #667eea;
--xai-chat-secondary: #764ba2;
--xai-chat-background: #f8fafc;
--xai-chat-text: #374151;

// Espacements
--xai-chat-padding: 1rem;
--xai-chat-border-radius: 16px;
```

### Mode Sombre (Optionnel)

```scss
.dark-theme {
  .xai-chat-container {
    --xai-chat-background: #1e293b;
    --xai-chat-text: #f1f5f9;
  }
}
```

## Messages et Traductions

Toutes les chaînes de caractères sont traduites via `@ngx-translate/core`. Les clés de traduction se trouvent sous `XAI.CHAT.*` dans les fichiers de traduction.

### Clés Principales

```json
{
  "XAI.CHAT.TITLE": "Chat IA Explicable",
  "XAI.CHAT.SUBTITLE": "Posez vos questions sur l'explication",
  "XAI.CHAT.ASK_QUESTION_PLACEHOLDER": "Posez votre question...",
  "XAI.CHAT.QUESTIONS_REMAINING": "{{ count }} question(s) restante(s)"
}
```

## Performances et Optimisations

### Gestion Mémoire

- Les messages sont chargés de manière lazy
- La session est automatiquement nettoyée après fermeture
- Les subscriptions sont correctement désabonnées

### Réseau

- Les questions sont envoyées de manière asynchrone
- Le polling est optimisé pour éviter les requêtes excessives
- Les réponses sont mises en cache côté client

## Limitations et Contraintes

- **Maximum 10 questions par session** (configurable)
- **Timeout de 30 secondes** pour les réponses GPT
- **Taille des questions limitée à 500 caractères**
- **Session expire après 1 heure d'inactivité**

## Support et Maintenance

Ce composant fait partie de la plateforme IBIS-X et est maintenu dans le cadre du projet XAI Engine. Pour les bugs et améliorations, utiliser le système de tickets interne.
