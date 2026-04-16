# 🎯 PROMPT COMPLET : Interface de Prédiction Directe - IBIS-X

> **⚠️ STATUT : FEATURE PLANIFIÉE — NON IMPLÉMENTÉE (vérifié 2026-04-14)**
>
> Ce document décrit une feature qui **n'existe pas encore dans le code** :
> - L'endpoint `POST /experiments/{experiment_id}/predict` dans `ml-pipeline-service` **n'est pas implémenté**.
> - Le composant `PredictionInterfaceComponent` (dossier `frontend/src/app/pages/ml-pipeline/prediction-interface/`) **n'existe pas**.
> - `experiment-results.component.html` ne contient actuellement que **2 onglets** ("Résultats Généraux" et "Explicabilité XAI"), pas 3.
>
> Document conservé comme **spécification pour implémentation future**. À ne pas utiliser comme référence de l'état actuel.

## 📋 CONTEXTE
**Situation actuelle** : Après entraînement d'un modèle Random Forest sur Iris, l'utilisateur n'a que 2 options :
1. **Télécharger** le modèle .joblib et coder en Python ✅ (disponible)
2. **XAI Explications** sur des prédictions existantes ✅ (disponible)

**MANQUE CRITIQUE** : Interface web intuitive pour faire des prédictions directes sans coding ! ❌

---

## 🎯 OBJECTIF : Interface de Prédiction Web

### **Nouvel Onglet "Prédictions"**
Ajouter un 3ème onglet sur la page de résultats d'expérience :
```
[ Résultats Généraux ] [ Explicabilité XAI ] [ 🆕 Prédictions ]
```

### **Interface Utilisateur**
```
🌸 FAIRE UNE PRÉDICTION AVEC VOTRE RANDOM FOREST

┌─ Saisie des Données ─────────────────────────┐
│ Sepal Length: [5.1] cm    (min: 4.3, max: 7.9) │
│ Sepal Width:  [3.5] cm    (min: 2.0, max: 4.4) │  
│ Petal Length: [1.4] cm    (min: 1.0, max: 6.9) │
│ Petal Width:  [0.2] cm    (min: 0.1, max: 2.5) │
└─────────────────────────────────────────────┘

[ 🎯 Prédire avec Random Forest (100 arbres) ]

┌─ Résultat de Prédiction ──────────────────────┐
│ 🌺 Classe Prédite: Iris-virginica            │
│ 🎯 Confiance: 97.3%                          │  
│                                              │
│ 📊 Détail du Vote (100 arbres):             │
│ • Setosa:     1% (1 arbre)                   │
│ • Versicolor: 2% (2 arbres)                  │
│ • Virginica:  97% (97 arbres)                │
│                                              │
│ 🤖 Explication: Selon vos mesures, cette    │
│    fleur a des pétales larges et longs,      │
│    caractéristiques typiques d'Iris virginica│
└─────────────────────────────────────────────┘
```

---

## 🛠️ SPÉCIFICATIONS TECHNIQUES

### **1. Backend - Nouvel Endpoint API**

#### **Endpoint de Prédiction**
```python
# ml-pipeline-service/app/main.py
@app.post("/experiments/{experiment_id}/predict")
def predict_with_model(
    experiment_id: str,
    prediction_request: PredictionRequest,
    db: Session = Depends(get_db)
):
    """
    Faire une prédiction avec un modèle entraîné
    
    Args:
        experiment_id: ID de l'expérience avec modèle entraîné
        prediction_request: Données à prédire au format JSON
    
    Returns:
        PredictionResponse avec prédiction + probabilités + explication
    """
```

#### **Nouveau Schema Pydantic**
```python
# ml-pipeline-service/app/schemas.py
class PredictionRequest(BaseModel):
    features: Dict[str, float]  # {"sepal_length": 5.1, "sepal_width": 3.5, ...}
    
class PredictionResponse(BaseModel):
    predicted_class: str  # "Iris-virginica"
    confidence: float     # 0.973
    probabilities: Dict[str, float]  # {"setosa": 0.01, "versicolor": 0.02, "virginica": 0.97}
    explanation: str      # "Vote de 100 arbres : 97 pour Virginica"
    feature_values: Dict[str, float]  # Echo des valeurs saisies
```

#### **Logique de Prédiction**
```python
# ml-pipeline-service/app/services/prediction_service.py
def make_prediction_with_experiment(experiment_id: str, features: Dict[str, float]) -> Dict[str, Any]:
    """
    1. Charger modèle + preprocessing pipeline depuis MinIO
    2. Valider et transformer les features d'entrée
    3. Faire prédiction + probabilités
    4. Générer explication simple
    5. Retourner résultat structuré
    """
```

---

### **2. Frontend - Nouvel Onglet Prédiction**

#### **Nouveau Composant**
```typescript
// frontend/src/app/pages/ml-pipeline/prediction-interface/prediction-interface.component.ts
export class PredictionInterfaceComponent implements OnInit {
  experimentId: string = '';
  features: { [key: string]: FormControl } = {};
  predictionForm: FormGroup;
  predictionResult: PredictionResponse | null = null;
  isLoading = false;
  featureMetadata: FeatureMetadata[] = []; // Min, max, moyennes du dataset
  
  // Méthodes principales
  onPredict(): void { /* Appel API + affichage résultat */ }
  validateFeatures(): boolean { /* Validation des saisies */ }
  getFeatureValidation(feature: string): ValidationErrors | null { /* Validation par feature */ }
}
```

#### **Interface Adaptive par Dataset**
```typescript
// Iris Dataset
interface IrisFeatures {
  sepal_length: { min: 4.3, max: 7.9, unit: 'cm', description: 'Longueur du sépale' };
  sepal_width: { min: 2.0, max: 4.4, unit: 'cm', description: 'Largeur du sépale' };
  petal_length: { min: 1.0, max: 6.9, unit: 'cm', description: 'Longueur du pétale' };
  petal_width: { min: 0.1, max: 2.5, unit: 'cm', description: 'Largeur du pétale' };
}

// Breast Cancer Dataset
interface BreastCancerFeatures {
  mean_radius: { min: 6.98, max: 28.11, description: 'Rayon moyen de la tumeur' };
  mean_texture: { min: 9.71, max: 39.28, description: 'Texture moyenne' };
  // ... autres features
}
```

#### **Template Responsive**
```html
<!-- frontend/src/app/pages/ml-pipeline/prediction-interface/prediction-interface.component.html -->
<div class="prediction-interface">
  <!-- Header explicatif -->
  <div class="prediction-header">
    <h3>🎯 Faire une Prédiction avec votre {{getAlgorithmName()}}</h3>
    <p>Saisissez des valeurs pour voir la prédiction de votre modèle entraîné</p>
  </div>

  <!-- Formulaire de saisie -->
  <form [formGroup]="predictionForm" class="features-form">
    <div class="features-grid">
      <mat-form-field *ngFor="let feature of getFeatureList()" class="feature-input">
        <mat-label>{{feature.display_name}} ({{feature.unit}})</mat-label>
        <input matInput 
               type="number" 
               [formControlName]="feature.key"
               [placeholder]="feature.placeholder"
               [min]="feature.min"
               [max]="feature.max"
               step="0.1">
        <mat-hint>{{feature.description}}</mat-hint>
        <mat-error *ngIf="predictionForm.get(feature.key)?.hasError('required')">
          Valeur requise
        </mat-error>
        <mat-error *ngIf="predictionForm.get(feature.key)?.hasError('min')">
          Minimum: {{feature.min}}
        </mat-error>
        <mat-error *ngIf="predictionForm.get(feature.key)?.hasError('max')">
          Maximum: {{feature.max}}
        </mat-error>
      </mat-form-field>
    </div>
    
    <!-- Bouton de prédiction -->
    <div class="prediction-actions">
      <button mat-flat-button 
              color="primary" 
              [disabled]="predictionForm.invalid || isLoading"
              (click)="onPredict()"
              class="predict-btn">
        <mat-icon *ngIf="!isLoading">psychology</mat-icon>
        <mat-spinner *ngIf="isLoading" diameter="20"></mat-spinner>
        <span>{{isLoading ? 'Prédiction en cours...' : 'Prédire avec ' + getAlgorithmName()}}</span>
      </button>
    </div>
  </form>

  <!-- Résultat de prédiction -->
  <div *ngIf="predictionResult" class="prediction-result">
    <div class="result-header">
      <mat-icon class="result-icon">{{getPredictionIcon()}}</mat-icon>
      <h4>Résultat de Prédiction</h4>
    </div>
    
    <div class="result-content">
      <!-- Prédiction principale -->
      <div class="main-prediction">
        <span class="predicted-class">{{predictionResult.predicted_class}}</span>
        <span class="confidence">{{formatConfidence(predictionResult.confidence)}}</span>
      </div>
      
      <!-- Détail des probabilités -->
      <div class="probabilities-detail">
        <h5>📊 Détail du Vote ({{getTreeCount()}} arbres):</h5>
        <div *ngFor="let prob of getFormattedProbabilities()" class="probability-item">
          <div class="class-name">{{prob.class}}</div>
          <div class="probability-bar">
            <div class="bar-fill" [style.width.%]="prob.percentage"></div>
          </div>
          <div class="percentage">{{prob.percentage}}% ({{prob.trees}} arbres)</div>
        </div>
      </div>
      
      <!-- Explication simple -->
      <div class="prediction-explanation">
        <mat-icon>lightbulb</mat-icon>
        <p>{{predictionResult.explanation}}</p>
      </div>
    </div>
  </div>
</div>
```

---

### **3. Intégration dans la Page Résultats**

#### **Modification Component Principal**
```typescript
// frontend/src/app/pages/ml-pipeline/experiment-results/experiment-results.component.html
<mat-tab-group [(selectedIndex)]="selectedTabIndex" (selectedTabChange)="onTabChange($event.index)">
  
  <!-- Onglet 1: Résultats existants -->
  <mat-tab label="Résultats Généraux">
    <!-- Contenu existant inchangé -->
  </mat-tab>

  <!-- Onglet 2: XAI existant -->  
  <mat-tab label="Explicabilité XAI">
    <!-- Contenu XAI existant -->
  </mat-tab>

  <!-- 🆕 NOUVEL ONGLET 3: Prédictions -->
  <mat-tab label="Prédictions" [disabled]="!canMakePredictions()">
    <app-prediction-interface 
      [experimentId]="experimentId"
      [algorithm]="getAlgorithm()"
      [taskType]="getTaskType()"
      [featureMetadata]="getFeatureMetadata()">
    </app-prediction-interface>
  </mat-tab>
  
</mat-tab-group>
```

---

## 🔧 IMPLÉMENTATION TECHNIQUE

### **Backend - API Endpoint**
```python
# 1. Créer nouveau service de prédiction
# ml-pipeline-service/app/services/prediction_service.py

# 2. Ajouter endpoint dans main.py
POST /experiments/{experiment_id}/predict

# 3. Charger modèle depuis MinIO
# 4. Appliquer preprocessing pipeline
# 5. Faire prédiction + probabilités  
# 6. Générer explication simple
```

### **Frontend - Nouveau Composant**
```typescript
// 1. Créer PredictionInterfaceComponent
ng generate component pages/ml-pipeline/prediction-interface

// 2. Ajouter service de prédiction
// frontend/src/app/services/prediction.service.ts

// 3. Intégrer dans onglets de experiment-results
// 4. Styling responsive avec Angular Material
```

---

## 🎯 CAS D'USAGE SPÉCIFIQUES

### **Random Forest + Iris Classification**
```
Utilisateur saisit: sepal_length=6.2, sepal_width=3.1, petal_length=5.1, petal_width=1.8
Vote Random Forest: 
- 2 arbres → Versicolor
- 98 arbres → Virginica  
Résultat: "Iris-virginica (98% confiance)"
```

### **Decision Tree + Breast Cancer**
```
Utilisateur saisit: mean_radius=17.5, mean_texture=22.1, ...
Decision Tree logique:
- Si mean_radius > 16.8 → Malin (84% confiance)
Résultat: "Tumeur maligne (84% confiance)"
```

---

## 🚀 VALEUR AJOUTÉE

### **Pour l'Utilisateur**
- ✅ **Usage immédiat** du modèle sans coding
- ✅ **Validation temps réel** des performances  
- ✅ **Compréhension intuitive** du fonctionnement
- ✅ **Interface pédagogique** avec explications

### **Pour IBIS-X**
- ✅ **Écosystème complet** : Entraînement → Résultats → Usage
- ✅ **Différenciation** vs outils concurrents
- ✅ **Accessibilité** pour non-programmeurs
- ✅ **Validation scientifique** des modèles

---

## 📊 WORKFLOW COMPLET

```
1. [EXISTANT] Utilisateur entraîne Random Forest sur Iris
2. [EXISTANT] Obtient résultats : F1-Macro 90%, OOB 95%
3. [NOUVEAU] Clique sur onglet "Prédictions"
4. [NOUVEAU] Saisit nouvelles valeurs : 5.1, 3.5, 1.4, 0.2
5. [NOUVEAU] Clique "Prédire avec Random Forest"
6. [NOUVEAU] Voit résultat : "Iris-setosa (99% confiance)"
7. [NOUVEAU] Comprend le vote : 99 arbres → Setosa, 1 arbre → Versicolor
```

---

## 🔧 ARCHITECTURE TECHNIQUE

### **Séquence d'Appel**
```
Frontend → API Gateway → ML Pipeline Service → 
Load Model from MinIO → Apply Preprocessing → 
Make Prediction → Return Structured Result
```

### **Sécurité & Validation**
- ✅ Authentification via API Gateway
- ✅ Validation que l'expérience est complétée
- ✅ Validation des ranges de features (min/max)
- ✅ Gestion d'erreurs complète

### **Performance**
- ✅ Cache des modèles récemment utilisés
- ✅ Validation côté client pour UX rapide
- ✅ Timeout appropriés (5-10s max)

---

## 📱 DESIGN RESPONSIVE

### **Desktop**
- Formulaire 2 colonnes pour les features
- Résultat à droite avec graphiques
- Boutons d'action bien visibles

### **Mobile**  
- Formulaire 1 colonne empilée
- Résultat en dessous du formulaire
- Optimisation tactile

---

## 🧪 VALIDATION & TESTS

### **Tests Unitaires**
- Validation des ranges de features
- Transformation des données
- Gestion des erreurs API

### **Tests d'Intégration**
- Workflow complet sur dataset Iris
- Validation avec différents algorithmes
- Test avec datasets variés (Breast Cancer, etc.)

### **Tests UX**
- Interface intuitive pour non-techniciens
- Messages d'erreur clairs
- Performance acceptable (&lt;3s)

---

## 🎓 IMPACT PÉDAGOGIQUE

### **Apprentissage ML**
- **Compréhension** : Voir l'impact de chaque feature
- **Validation** : Tester différentes valeurs
- **Comparaison** : Random Forest vs Decision Tree

### **Recherche Académique**
- **Reproductibilité** : Interface standardisée
- **Documentation** : Prédictions traçables
- **Collaboration** : Partage facile avec équipes

---

## 🎯 PRIORITÉ D'IMPLÉMENTATION

### **Phase 1 : MVP** (1-2h)
1. Endpoint API basique
2. Interface simple (4 champs pour Iris)
3. Affichage résultat basique

### **Phase 2 : Robuste** (2-3h)  
1. Interface adaptive selon dataset
2. Validation avancée
3. Explications détaillées

### **Phase 3 : Avancée** (3-4h)
1. Cache des modèles
2. Historique des prédictions
3. Export/comparaison des résultats

---

## 🔬 JUSTIFICATION SCIENTIFIQUE

**Problème Actuel** : 
- Gap entre entraînement et utilisation
- Barrière technique pour non-programmeurs
- Validation manuelle complexe

**Solution Proposée** :
- Interface web intuitive et immédiate
- Validation temps réel des performances
- Accessibilité pour tous les profils utilisateurs

**Impact** :
- Augmentation de l'adoption IBIS-X
- Validation scientifique simplifiée  
- Écosystème ML complet et professionnel

---

## 🚀 RÉSULTAT FINAL

**Avant** : "Mon modèle est entraîné... et maintenant ?" 🤔

**Après** : "Je peux tester mon modèle immédiatement sur n'importe quelles données !" 🎉

Cette fonctionnalité transforme IBIS-X d'un **outil d'entraînement** en une **plateforme ML complète** avec utilisation directe des modèles entraînés.
