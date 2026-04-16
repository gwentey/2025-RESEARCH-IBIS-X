import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface DatasetAIRequest {
  dataset_id: string;
  dataset_metadata: {
    name: string;
    objective?: string;
    domain: string[];
    task: string[];
    instances_number: number;
    features_number: number;
    global_missing_percentage?: number;
    availability?: string;
    anonymization_applied?: boolean;
    year?: number;
  };
  analysis_type: 'dataset_analysis' | 'ml_recommendations';
}

export interface DatasetAIResponse {
  request_id: string;
  analysis: {
    summary: string;
    recommended_task: 'classification' | 'regression';
    recommended_algorithm: 'decision_tree' | 'random_forest';
    reasoning: string;
    expected_results: string;
    key_insights: string[];
    potential_challenges: string[];
    confidence_score: number;
  };
  generated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class DatasetAIService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api/v1`;

  /**
   * Demande une analyse IA du dataset
   */
  analyzeDataset(request: DatasetAIRequest): Observable<DatasetAIResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    return this.http.post<DatasetAIResponse>(`${this.baseUrl}/dataset-ai/analyze`, request, { headers })
      .pipe(
        catchError(error => {
          console.error(`Erreur lors de l'analyse IA du dataset:`, error);
          return throwError(() => new Error(`Impossible d'analyser le dataset avec l'IA`));
        })
      );
  }

  /**
   * Récupère une analyse IA existante par ID
   */
  getAnalysis(requestId: string): Observable<DatasetAIResponse> {
    return this.http.get<DatasetAIResponse>(`${this.baseUrl}/dataset-ai/analysis/${requestId}`)
      .pipe(
        catchError(error => {
          console.error(`Erreur lors de la récupération de l'analyse:`, error);
          return throwError(() => new Error(`Analyse non trouvée`));
        })
      );
  }

  /**
   * Génère une analyse mock pour le développement
   */
  generateMockAnalysis(dataset: any): Observable<DatasetAIResponse> {
    // Logique d'analyse basée sur les métadonnées
    const hasClassificationTask = dataset.task?.some((t: string) => 
      t.toLowerCase().includes('classification') || 
      t.toLowerCase().includes('categor') ||
      t.toLowerCase().includes('predict')
    );
    
    const hasRegressionTask = dataset.task?.some((t: string) => 
      t.toLowerCase().includes('regression') || 
      t.toLowerCase().includes('forecast') ||
      t.toLowerCase().includes('estimate')
    );
    
    const isLargeDataset = dataset.instances_number > 10000;
    const hasManyFeatures = dataset.features_number > 20;
    const isEducationDomain = dataset.domain?.some((d: string) => d.toLowerCase().includes('education'));
    
    // Analyse contextuelle intelligente
    const datasetName = dataset.display_name?.toLowerCase() || '';
    const objective = dataset.objective || '';
    const analysis = this.generateContextualAnalysis(datasetName, objective, dataset.domain || [], dataset);
    
    let recommended_task: 'classification' | 'regression' = analysis.recommended_task;
    let task_reasoning: string = analysis.task_explanation;
    
    // Détermination de l'algorithme
    const recommended_algorithm: 'decision_tree' | 'random_forest' = 
      (isLargeDataset && hasManyFeatures) ? 'random_forest' : 'decision_tree';
    
    const algorithm_reasoning = recommended_algorithm === 'random_forest'
      ? 'Random Forest sera plus robuste avec ce volume de données et nombre de caractéristiques. Il réduira le sur-apprentissage.'
      : 'Decision Tree sera parfait pour ce dataset - résultats interprétables et logique de décision claire.';

    const mockAnalysis: DatasetAIResponse = {
      request_id: `ai_${Date.now()}`,
      analysis: {
        summary: analysis.summary,
        
        recommended_task,
        recommended_algorithm,
        reasoning: task_reasoning,
        expected_results: recommended_algorithm === 'random_forest'
          ? `${analysis.expected_results} Random Forest ajoutera de la robustesse avec plusieurs arbres de décision combinés pour éviter les erreurs.`
          : `${analysis.expected_results} Decision Tree vous donnera une logique de décision transparente - vous verrez exactement comment l\'IA prend ses décisions.`,
        key_insights: analysis.key_insights,
        
        potential_challenges: this.generateChallenges(dataset, isLargeDataset, hasManyFeatures),
        confidence_score: 0.85
      },
      generated_at: new Date().toISOString()
    };

    // Retourne un Observable simulé
    return new Observable(observer => {
      setTimeout(() => {
        observer.next(mockAnalysis);
        observer.complete();
      }, 100);
    });
  }

  private generateChallenges(dataset: any, isLarge: boolean, manyFeatures: boolean): string[] {
    const challenges: string[] = [];
    const datasetName = dataset.display_name?.toLowerCase() || '';
    
    // Défis contextuels selon le type de dataset
    if (datasetName.includes('iris')) {
      challenges.push(`📄 Dataset d'entraînement - vous devrez diviser en train/test pour évaluer les performances`);
      challenges.push('🎯 Seulement 50 exemples par espèce - attention à ne pas sur-entraîner');
      return challenges;
    }
    
    if (isLarge && manyFeatures) {
      challenges.push(`⏱️ Dataset volumineux - l'entraînement prendra quelques minutes`);
      challenges.push(`🧠 Beaucoup de variables - l'IA devra identifier les plus importantes`);
    }
    
    if (dataset.global_missing_percentage && dataset.global_missing_percentage > 0.05) {
      challenges.push(`🔧 Données incomplètes - l'IA devra gérer les valeurs manquantes intelligemment`);
    }
    
    if (!dataset.split) {
      challenges.push('📋 Vous devrez séparer vos données : 80% pour entraîner, 20% pour tester');
    }
    
    if (!dataset.anonymization_applied) {
      challenges.push('🔒 Vérifiez que les données personnelles sont bien protégées');
    }
    
    if (challenges.length === 0) {
      challenges.push(`✅ Excellent ! Ce dataset est parfaitement prêt pour l'IA - aucune difficulté prévue`);
    }
    
    return challenges;
  }
  
  /**
   * Analyse contextuelle basée sur le contenu réel du dataset
   */
  private generateContextualAnalysis(datasetName: string, objective: string, domains: string[], dataset: any) {
    // Dataset Iris (fleurs) - Exemple concret
    if (datasetName.includes('iris')) {
      return {
        summary: `Le célèbre dataset Iris contient des mesures de ${dataset.instances_number} fleurs de 3 espèces différentes (setosa, versicolor, virginica). Chaque fleur est décrite par la longueur et largeur de ses pétales et sépales.`,
        recommended_task: 'classification' as const,
        task_explanation: `🌸 Vous allez créer un "classificateur d'espèces de fleurs". L'IA apprendra à reconnaître automatiquement l'espèce d'une fleur juste en analysant ses mesures physiques.`,
        expected_results: `Résultats concrets : Vous donnerez à l'IA les mesures d'une nouvelle fleur (ex: pétale 4.5cm, sépale 3.2cm) et elle vous dira "C'est une Versicolor à 95% de certitude". Vous découvrirez que la longueur des pétales est probablement le critère le plus important pour distinguer les espèces.`,
        key_insights: [
          `🌸 Dataset sur les fleurs - parfait pour comprendre la classification`,
          `📊 Taille idéale pour débuter (150 exemples, 4 mesures par fleur)`,
          `🎯 3 espèces à reconnaître : setosa, versicolor, virginica`,
          `🔍 Caractéristiques simples : longueurs et largeurs des parties de la fleur`
        ]
      };
    }
    
    // Datasets éducation
    if (domains.some(d => d.toLowerCase().includes('education')) || datasetName.includes('student') || datasetName.includes('étudiant')) {
      return {
        summary: `Ce dataset éducatif analyse ${dataset.instances_number} étudiants et leurs facteurs de réussite. Il révèle ce qui influence vraiment les performances scolaires.`,
        recommended_task: 'classification' as const,
        task_explanation: `🏭 Vous allez créer un "prédicteur de réussite scolaire". L'IA apprendra à identifier à l'avance quels étudiants risquent d'échouer pour les aider à temps.`,
        expected_results: `Résultats pratiques : "Cet étudiant avec 12h d'étude/semaine, 85% de présence et 14/20 de moyenne a 78% de chances de réussir son examen final". Vous découvrirez si c'est le temps d'étude, l'assiduité ou les notes antérieures qui prédisent le mieux la réussite.`,
        key_insights: [
          `🏭 Données étudiantes - prévention de l'échec scolaire`,
          `📈 Identification des facteurs clés de réussite`,
          `🎯 Aide concrète aux décisions pédagogiques`,
          `⚡ Intervention précoce pour les étudiants en difficulté`
        ]
      };
    }
    
    // Datasets santé/médical
    if (domains.some(d => d.toLowerCase().includes('health')) || datasetName.includes('medical') || datasetName.includes('patient')) {
      const isRegression = objective?.toLowerCase().includes('prévoir') || objective?.toLowerCase().includes('estim');
      return {
        summary: `Dataset médical avec ${dataset.instances_number} patients et leurs indicateurs de santé. Permet de prédire des conditions médicales pour améliorer le diagnostic.`,
        recommended_task: isRegression ? 'regression' as const : 'classification' as const,
        task_explanation: isRegression 
          ? `🏥 Vous créerez un "calculateur de risque médical". L'IA donnera des scores numériques de risque pour aider les médecins.`
          : `🏥 Vous créerez un "détecteur de maladie". L'IA apprendra à identifier automatiquement la présence ou absence de conditions médicales.`,
        expected_results: isRegression
          ? 'Résultats : "Ce patient a un score de risque de 7.2/10 pour cette pathologie basé sur ses analyses". Vous saurez quels indicateurs (tension, taux, âge) sont les plus alarm (ants.'
          : `Résultats : "Ce patient a 94% de probabilité d'avoir cette maladie selon ses symptômes et analyses". Vous identifierez quels signes sont les plus fiables pour le diagnostic.`,
        key_insights: [
          '🏥 Données médicales - amélioration du diagnostic',
          '🔬 Analyse prédictive des conditions de santé',
          '⚡ Détection précoce des risques',
          '📈 Support concret à la décision médicale'
        ]
      };
    }
    
    // Datasets financiers
    if (domains.some(d => d.toLowerCase().includes('finance')) || datasetName.includes('credit') || datasetName.includes('loan')) {
      return {
        summary: `Dataset financier de ${dataset.instances_number} clients avec leurs profils financiers complets. Permet d'évaluer automatiquement les risques de crédit.`,
        recommended_task: 'classification' as const,
        task_explanation: `💰 Vous créerez un "détecteur de risque de crédit". L'IA apprendra à prédire si un client va rembourser son prêt ou faire défaut.`,
        expected_results: `Résultats bancaires : "Ce client avec 45K€ de revenus, 15% d'endettement et 3 ans d'historique a 88% de chances de bien rembourser". Vous identifierez quels critères (revenus, historique, âge, situation familiale) sont les plus prédictifs du risque.`,
        key_insights: [
          '💰 Analyse de solvabilité - réduction des risques',
          '⚡ Décisions de crédit automatisées et justifiées',
          '🎯 Amélioration de la rentabilité du portefeuille',
          '📈 Respect automatique des critères réglementaires'
        ]
      };
    }
    
    // Dataset avec objectif défini
    if (objective) {
      const isClassification = objective.toLowerCase().includes('catégor') || 
                              objective.toLowerCase().includes('class') || 
                              objective.toLowerCase().includes('prédire') ||
                              objective.toLowerCase().includes('identifier');
      
      return {
        summary: `${objective} Ce dataset de ${dataset.instances_number} observations vous permettra d'atteindre cet objectif de manière automatisée.`,
        recommended_task: isClassification ? 'classification' as const : 'regression' as const,
        task_explanation: isClassification 
          ? `🎯 Avec ce dataset, vous créerez un système de classification personnalisé. L'IA apprendra vos critères pour catégoriser automatiquement de nouveaux éléments.`
          : `📈 Vous créerez un prédicteur numérique intelligent. L'IA trouvera les formules mathématiques optimales dans vos données.`,
        expected_results: isClassification
          ? `Après entraînement, vous pourrez traiter automatiquement de nouveaux cas : "Cet élément appartient à la catégorie X à 89% de certitude". L'IA vous expliquera ses décisions.`
          : `Vous obtiendrez des prédictions précises : "La valeur estimée est 142.7 ± 12.3". L'IA vous montrera quels paramètres influencent le plus vos résultats.`,
        key_insights: [
          `📁 ${dataset.instances_number} exemples pour entraîner l'IA sur votre problème`,
          `🔍 ${dataset.features_number} variables à analyser pour trouver les patterns`,
          `🎯 Objectif clair : ${objective.substring(0, 60)}${objective.length > 60 ? '...' : ''}`,
          `📈 ${Math.round((1 - (dataset.global_missing_percentage || 0)) * 100)}% de données exploitables`
        ]
      };
    }
    
    // Fallback général mais amélioré
    return {
      summary: `Dataset "${dataset.display_name}" contenant ${dataset.instances_number} observations. Même sans objectif précis, ces données recellent probablement des patterns intéressants à découvrir.`,
      recommended_task: 'classification' as const,
      task_explanation: `🔍 Nous recommandons l'exploration par classification pour découvrir des groupes naturels dans vos données. Vous pourriez découvrir des catégories surprenantes !`,
      expected_results: `L'IA analysera vos données et vous proposera : "J'ai trouvé 3 groupes distincts dans vos données". Elle vous expliquera ce qui caractérise chaque groupe et pourquoi ils sont différents.`,
      key_insights: [
        `🔍 Dataset exploratoire - ${dataset.instances_number} éléments à analyser`,
        `🧩 ${dataset.features_number} dimensions pour trouver des patterns`,
        `✨ Potentiel de découvertes inattendues`,
        `🎯 Parfait pour comprendre vos données avant analyses plus poussées`
      ]
    };
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num?.toString() || '0';
  }
}
