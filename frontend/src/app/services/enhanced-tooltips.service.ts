import { Injectable } from '@angular/core';

export interface TooltipConfig {
  level: 'novice' | 'intermediate' | 'expert';
  showTechnicalDetails: boolean;
  showExamples: boolean;
  language: 'fr' | 'en';
}

export interface EnhancedTooltip {
  title: string;
  description: string;
  technicalDetails?: string;
  examples?: string[];
  analogies?: string;
  learnMore?: string;
  warnings?: string[];
  tips?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class EnhancedTooltipsService {
  private defaultConfig: TooltipConfig = {
    level: 'novice',
    showTechnicalDetails: false,
    showExamples: true,
    language: 'fr'
  };

  private config: TooltipConfig = { ...this.defaultConfig };

  constructor() {}

  setConfig(config: Partial<TooltipConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 📊 TOOLTIPS POUR MÉTRIQUES - Explications adaptées selon le niveau
   */
  getMetricTooltip(metricKey: string, value: number, taskType: 'classification' | 'regression', algorithm: string): EnhancedTooltip {
    const baseTooltips = this.getBaseMetricTooltips();
    const baseTooltip = baseTooltips[metricKey];
    
    if (!baseTooltip) {
      return this.createFallbackTooltip(metricKey, value);
    }

    // Adapter selon le niveau utilisateur
    let tooltip: EnhancedTooltip = { ...baseTooltip };
    
    // Ajouter du contexte selon l'algorithme
    tooltip = this.addAlgorithmContext(tooltip, metricKey, algorithm);
    
    // Ajouter des exemples concrets
    tooltip = this.addConcreteExamples(tooltip, metricKey, value, taskType);
    
    // Ajouter des conseils pratiques
    tooltip = this.addPracticalTips(tooltip, metricKey, value, taskType, algorithm);

    return tooltip;
  }

  /**
   * 🌳 TOOLTIPS POUR ARBRES - Explications détaillées des nœuds
   */
  getTreeNodeTooltip(node: any, algorithm: string, taskType: string, depth: number): EnhancedTooltip {
    if (node.is_leaf) {
      return this.getLeafNodeTooltip(node, algorithm, taskType);
    } else {
      return this.getInternalNodeTooltip(node, algorithm, taskType, depth);
    }
  }

  /**
   * 🎯 TOOLTIPS POUR ALGORITHMES - Explications des choix
   */
  getAlgorithmTooltip(algorithm: string, taskType: string, performance: number): EnhancedTooltip {
    const algorithmTooltips = {
      'random_forest': {
        title: '🌲 Random Forest (Forêt Aléatoire)',
        description: 'Combine plusieurs arbres de décision pour une prédiction plus robuste et précise.',
        technicalDetails: 'Utilise le bagging (bootstrap aggregating) avec des sous-échantillons aléatoires de features à chaque split.',
        analogies: 'Comme consulter plusieurs experts avant de prendre une décision importante : chaque expert (arbre) donne son avis, puis on fait la moyenne des opinions.',
        examples: [
          'Médecine : 100 médecins diagnostiquent un patient, le diagnostic final = vote majoritaire',
          'Finance : 50 analystes évaluent un investissement, décision = consensus'
        ],
        tips: [
          '🎯 Plus d\'arbres = plus de stabilité (mais calcul plus long)',
          '📊 Résistant au sur-ajustement grâce à l\'agrégation',
          '🔍 Permet d\'estimer l\'incertitude des prédictions'
        ]
      },
      'decision_tree': {
        title: '🌳 Arbre de Décision',
        description: 'Modèle simple et interprétable qui prend des décisions en suivant une série de questions.',
        technicalDetails: 'Utilise des critères comme Gini ou Entropy pour choisir les meilleures questions à chaque nœud.',
        analogies: 'Comme un questionnaire médical : "Avez-vous de la fièvre ? Si oui, température > 38°C ? Si oui, diagnostic probable..."',
        examples: [
          'Diagnostic médical : Symptômes → Questions → Diagnostic',
          'Approbation crédit : Revenus → Questions → Accepté/Refusé'
        ],
        tips: [
          '🎯 Facile à comprendre et expliquer',
          '⚠️ Attention au sur-ajustement si trop profond',
          '🔍 Chaque chemin racine→feuille = règle de décision'
        ]
      }
    };

    const base = algorithmTooltips[algorithm as keyof typeof algorithmTooltips];
    if (!base) return this.createFallbackTooltip(algorithm, performance);

    // Ajouter du contexte selon la performance
    let tooltip: EnhancedTooltip = { ...base };
    
    if (performance >= 90) {
      tooltip.tips = [...(tooltip.tips || []), '🎉 Excellente performance ! Prêt pour la production'];
    } else if (performance < 70) {
      tooltip.warnings = ['⚠️ Performance faible - considérez plus de données ou un autre algorithme'];
    }

    return tooltip;
  }



  private addAlgorithmContext(tooltip: EnhancedTooltip, metricKey: string, algorithm: string): EnhancedTooltip {
    const contextualTips = [];
    
    if (algorithm === 'random_forest') {
      if (['accuracy', 'precision', 'recall', 'f1_score'].includes(metricKey)) {
        contextualTips.push('🌲 Random Forest : Métrique calculée après vote de tous les arbres');
        contextualTips.push('📊 Plus stable qu\'un arbre unique grâce à l\'agrégation');
      }
    } else if (algorithm === 'decision_tree') {
      if (['accuracy', 'precision', 'recall', 'f1_score'].includes(metricKey)) {
        contextualTips.push('🌳 Decision Tree : Métrique d\'un seul arbre de décision');
        contextualTips.push('⚠️ Peut varier selon l\'échantillon (moins stable que RF)');
      }
    }

    return {
      ...tooltip,
      tips: [...(tooltip.tips || []), ...contextualTips]
    };
  }

  private addConcreteExamples(tooltip: EnhancedTooltip, metricKey: string, value: number, taskType: string): EnhancedTooltip {
    const examples = [];
    
    if (metricKey === 'accuracy' && taskType === 'classification') {
      const correct = Math.round(value * 100);
      examples.push(`Sur 100 prédictions, ${correct} sont correctes et ${100-correct} sont incorrectes`);
      
      if (value >= 0.9) {
        examples.push('🎯 Exemple : Classifier 1000 emails → 900+ bien classés');
      } else if (value < 0.7) {
        examples.push('⚠️ Exemple : Classifier 1000 emails → moins de 700 bien classés');
      }
    }
    
    if (metricKey === 'r2' && taskType === 'regression') {
      const explained = Math.round(value * 100);
      examples.push(`Le modèle explique ${explained}% des variations de la variable cible`);
      
      if (value >= 0.8) {
        examples.push('🎯 Très bon modèle : prédit 80%+ de la variabilité');
      } else if (value < 0.5) {
        examples.push('⚠️ Modèle faible : n\'explique que la moitié des variations');
      }
    }

    return {
      ...tooltip,
      examples: [...(tooltip.examples || []), ...examples]
    };
  }

  private addPracticalTips(tooltip: EnhancedTooltip, metricKey: string, value: number, taskType: string, algorithm: string): EnhancedTooltip {
    const tips = [];
    
    // Conseils selon la performance
    if (['accuracy', 'precision', 'recall', 'f1_score'].includes(metricKey)) {
      if (value >= 0.95) {
        tips.push('🎉 Performance excellente ! Vérifiez qu\'il n\'y a pas de sur-ajustement');
      } else if (value < 0.7) {
        tips.push('🔧 Performance à améliorer : plus de données ou autre algorithme');
      }
    }
    
    // Conseils spécifiques par métrique
    if (metricKey === 'precision' && value < 0.8) {
      tips.push('💡 Pour améliorer : Réduire les faux positifs avec un seuil plus strict');
    }
    
    if (metricKey === 'recall' && value < 0.8) {
      tips.push('💡 Pour améliorer : Capturer plus de cas positifs avec un seuil plus permissif');
    }

    return {
      ...tooltip,
      tips: [...(tooltip.tips || []), ...tips]
    };
  }

  private createFallbackTooltip(key: string, value: any): EnhancedTooltip {
    return {
      title: key,
      description: `Valeur : ${value}`,
      tips: ['ℹ️ Métrique standard d\'évaluation de modèle']
    };
  }

  private getBaseMetricTooltips(): { [key: string]: EnhancedTooltip } {
    return {
      'accuracy': {
        title: '🎯 Accuracy (Exactitude)',
        description: 'Pourcentage de prédictions correctes sur l\'ensemble des prédictions.',
        technicalDetails: 'Accuracy = (VP + VN) / (VP + VN + FP + FN)',
        analogies: 'Si un élève répond à 100 questions et en a 85 correctes, son accuracy = 85%',
        examples: [
          'Modèle spam : 95% accuracy = 95 emails sur 100 bien classés',
          'Diagnostic médical : 90% accuracy = 9 patients sur 10 bien diagnostiqués'
        ],
        tips: [
          '🎯 Métrique simple et intuitive',
          '⚠️ Peut être trompeuse avec des classes déséquilibrées'
        ]
      },
      'precision': {
        title: '🔍 Precision (Précision)',
        description: 'Parmi toutes les prédictions positives, combien étaient vraiment correctes ?',
        technicalDetails: 'Precision = VP / (VP + FP)',
        analogies: 'Test médical : Si le test dit "malade" pour 100 personnes, combien le sont vraiment ?',
        examples: [
          'Détection spam : Précision 95% = 95% des emails marqués "spam" sont vrais',
          'Reconnaissance faciale : 98% des "Anthony" détectés sont vraiment Anthony'
        ],
        tips: [
          '🎯 Importante quand les faux positifs coûtent cher',
          '📊 Complément du recall'
        ]
      },
      'recall': {
        title: '🔎 Recall (Sensibilité)',
        description: 'Parmi tous les cas positifs réels, combien ont été correctement identifiés ?',
        technicalDetails: 'Recall = VP / (VP + FN)',
        analogies: 'Contrôle sécurité : Sur 100 objets dangereux, combien ont été détectés ?',
        examples: [
          'Détection cancer : Recall 95% = 95% des cancers sont détectés',
          'Fraude bancaire : 88% des vraies fraudes sont identifiées'
        ],
        tips: [
          '🎯 Critique quand manquer un cas positif est dangereux',
          '⚠️ Améliorer le recall peut réduire la precision'
        ]
      },
      'f1_score': {
        title: '⚖️ F1-Score (Équilibre)',
        description: 'Moyenne harmonique entre precision et recall - équilibre optimal.',
        technicalDetails: 'F1 = 2 × (Precision × Recall) / (Precision + Recall)',
        analogies: 'Note d\'équilibre entre "être sûr" (precision) et "tout détecter" (recall)',
        examples: [
          'F1 = 85% : Bon équilibre entre precision et recall',
          'F1 faible mais accuracy haute : Classes déséquilibrées'
        ],
        tips: [
          '🎯 Métrique de référence pour classes déséquilibrées',
          '⚖️ Une seule métrique pour résumer precision + recall'
        ]
      },
      'r2': {
        title: '📈 R² (Coefficient de Détermination)',
        description: 'Pourcentage de variance des données expliqué par le modèle.',
        technicalDetails: 'R² = 1 - (SS_res / SS_tot)',
        analogies: 'Si les prix varient de 100k€ à 500k€, R²=80% = le modèle explique 80% de cette variation',
        examples: [
          'Prédiction prix : R²=85% = Explique 85% des variations de prix',
          'Prédiction salaire : R²=60% = 60% des différences expliquées'
        ],
        tips: [
          '🎯 Plus proche de 100%, mieux c\'est',
          '⚠️ R² négatif = modèle pire qu\'une moyenne'
        ]
      },
      'mae': {
        title: '📏 MAE (Erreur Absolue Moyenne)',
        description: 'Erreur moyenne entre prédictions et valeurs réelles.',
        technicalDetails: 'MAE = Σ|y_true - y_pred| / n',
        analogies: 'Si vous prédisez des prix et vous vous trompez en moyenne de 1000€, MAE = 1000',
        examples: [
          'Prédiction température : MAE = 2°C → erreur moyenne de 2 degrés',
          'Prédiction prix : MAE = 5000€ → erreur moyenne de 5000€'
        ],
        tips: [
          '📊 Plus bas = mieux (erreur plus faible)',
          '🎯 Unité = même unité que votre variable cible'
        ]
      },
      'mse': {
        title: '📐 MSE (Erreur Quadratique Moyenne)',
        description: 'Erreur quadratique moyenne - pénalise fortement les gros écarts.',
        technicalDetails: 'MSE = Σ(y_true - y_pred)² / n',
        analogies: 'Comme MAE mais les grosses erreurs comptent beaucoup plus',
        examples: [
          'Si 1 grosse erreur = 100, MSE sera très élevé même si le reste est bon',
          'MSE sensible aux outliers dans les prédictions'
        ],
        tips: [
          '📊 Plus bas = mieux',
          '⚠️ Très sensible aux valeurs aberrantes'
        ]
      },
      'rmse': {
        title: '📏 RMSE (Racine de l\'Erreur Quadratique)',
        description: 'Racine carrée du MSE - même unité que votre variable cible.',
        technicalDetails: 'RMSE = √MSE',
        analogies: 'RMSE = écart-type des erreurs de prédiction',
        examples: [
          'Prédiction prix : RMSE = 5000€ → erreur "typique" de 5000€',
          'Plus interprétable que MSE car même unité'
        ],
        tips: [
          '📊 Plus bas = mieux',
          '🎯 Comparable à MAE mais pénalise plus les gros écarts'
        ]
      }
    };
  }

  /**
   * 🎨 FORMATAGE HTML DU TOOLTIP
   */
  formatTooltipHtml(tooltip: EnhancedTooltip): string {
    let html = `<div class="enhanced-tooltip">`;
    
    // Titre
    html += `<div class="tooltip-title">${tooltip.title}</div>`;
    
    // Description
    html += `<div class="tooltip-description">${tooltip.description}</div>`;
    
    // Analogie (pour novices)
    if (tooltip.analogies && this.config.level === 'novice') {
      html += `<div class="tooltip-analogy">💡 <strong>Analogie :</strong> ${tooltip.analogies}</div>`;
    }
    
    // Détails techniques (pour experts)
    if (tooltip.technicalDetails && this.config.showTechnicalDetails) {
      html += `<div class="tooltip-technical">🔬 <strong>Détails :</strong> ${tooltip.technicalDetails}</div>`;
    }
    
    // Exemples
    if (tooltip.examples && this.config.showExamples) {
      html += `<div class="tooltip-examples">📋 <strong>Exemples :</strong>`;
      tooltip.examples.forEach(example => {
        html += `<div class="example-item">• ${example}</div>`;
      });
      html += `</div>`;
    }
    
    // Conseils
    if (tooltip.tips) {
      html += `<div class="tooltip-tips">`;
      tooltip.tips.forEach(tip => {
        html += `<div class="tip-item">${tip}</div>`;
      });
      html += `</div>`;
    }
    
    // Avertissements
    if (tooltip.warnings) {
      html += `<div class="tooltip-warnings">`;
      tooltip.warnings.forEach(warning => {
        html += `<div class="warning-item">${warning}</div>`;
      });
      html += `</div>`;
    }
    
    html += `</div>`;
    return html;
  }

  /**
   * 🌳 MÉTHODES POUR TOOLTIPS D'ARBRES (à implémenter)
   */
  getLeafNodeTooltip(node: any, algorithm: string, taskType: string): EnhancedTooltip {
    const className = node.class_name || node.name;
    const samples = node.samples || 0;
    
    return {
      title: `🍃 Prédiction : ${className}`,
      description: `Cette feuille prédit "${className}" basé sur ${samples} échantillons d'entraînement.`,
      analogies: `Comme un expert qui dit : "Avec ces caractéristiques, j'ai vu ${samples} cas similaires, c'était toujours '${className}'"`,
      examples: [
        `${samples} échantillons d'entraînement avaient les mêmes caractéristiques`,
        `Cette prédiction ${algorithm === 'random_forest' ? 'sera moyennée avec ~100 autres arbres' : 'est la décision finale'}`
      ],
      tips: [
        `📊 Plus d'échantillons (${samples}) = prédiction plus fiable`,
        '🎯 Chemin jusqu\'ici = règles logiques apprises des données'
      ]
    };
  }

  getInternalNodeTooltip(node: any, algorithm: string, taskType: string, depth: number): EnhancedTooltip {
    const feature = node.feature || node.name;
    const threshold = node.threshold || 0;
    const samples = node.samples || 0;
    
    return {
      title: `🌿 Test : ${feature}`,
      description: `Ce nœud teste si "${feature}" ${node.condition} pour séparer ${samples} échantillons.`,
      technicalDetails: `Seuil optimal calculé : ${threshold.toFixed(4)} pour maximiser la pureté`,
      analogies: `Comme demander : "Est-ce que ${feature} ${node.condition} ?" pour affiner la décision`,
      examples: [
        `Si ${feature} ${node.condition} → aller à gauche`,
        `Sinon → aller à droite`,
        `${samples} échantillons concernés par cette décision`
      ],
      tips: [
        `🔍 "${feature}" = vraie colonne de votre dataset`,
        `📊 Seuil ${threshold.toFixed(3)} = valeur optimale calculée`,
        `🎯 Profondeur ${depth} dans l'arbre`
      ],
      warnings: depth > 5 ? ['⚠️ Nœud profond : risque de sur-ajustement'] : undefined
    };
  }
}
