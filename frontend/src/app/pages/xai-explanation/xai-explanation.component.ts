import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface XAIMethod {
  id: 'lime' | 'shap';
  name: string;
  fullName: string;
  description: string;
  icon: string;
  color: string;
  strengths: string[];
  useCases: string[];
  howItWorks: string;
  example: {
    title: string;
    description: string;
    visualType: string;
  };
}

interface XAIBenefit {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'transparency' | 'trust' | 'compliance' | 'improvement';
}

interface XAIVideo {
  id: string;
  title: string;
  duration: string;
  description: string;
  thumbnail: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  topics: string[];
}

interface InteractiveExample {
  id: string;
  title: string;
  description: string;
  inputFeatures: Array<{
    name: string;
    value: number | string;
    importance?: number;
  }>;
  prediction: {
    result: string;
    confidence: number;
    explanation: string;
  };
}

@Component({
  selector: 'app-xai-explanation',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule,
    MatChipsModule,
    TranslateModule
  ],
  templateUrl: './xai-explanation.component.html',
  styleUrls: ['./xai-explanation.component.scss']
})
export class XAIExplanationComponent implements OnInit, OnDestroy, AfterViewInit {

  private intervals: any[] = [];

  // XAI Methods Data
  xaiMethods: XAIMethod[] = [
    {
      id: 'lime',
      name: 'LIME',
      fullName: 'Local Interpretable Model-agnostic Explanations',
      description: 'LIME explique individuellement chaque prédiction en analysant l\'impact local des caractéristiques autour de cette instance spécifique.',
      icon: '🔍',
      color: '#22c55e',
      strengths: [
        'Explications locales précises',
        'Fonctionne avec tout algorithme',
        'Compréhensible par les humains',
        'Détection des biais locaux'
      ],
      useCases: [
        'Décisions médicales critiques',
        'Approbation de crédit',
        'Détection de fraude',
        'Classification d\'images'
      ],
      howItWorks: 'LIME perturbe localement les données autour d\'une prédiction et observe comment cela affecte le résultat, créant un modèle simple et interprétable.',
      example: {
        title: 'Analyse d\'une demande de prêt',
        description: 'LIME explique pourquoi cette demande spécifique a été acceptée en montrant l\'impact de chaque critère.',
        visualType: 'local-bar-chart'
      }
    },
    {
      id: 'shap',
      name: 'SHAP',
      fullName: 'SHapley Additive exPlanations',
      description: 'SHAP utilise la théorie des jeux pour calculer la contribution équitable de chaque caractéristique à la prédiction finale.',
      icon: '⚖️',
      color: '#3b82f6',
      strengths: [
        'Contributions mathématiquement justes',
        'Explications globales et locales',
        'Propriétés théoriques garanties',
        'Visualisations avancées'
      ],
      useCases: [
        'Analyse de performance produit',
        'Optimisation marketing',
        'Recherche scientifique',
        'Modèles de pricing'
      ],
      howItWorks: 'SHAP calcule la contribution marginale de chaque caractéristique en considérant toutes les combinaisons possibles, basé sur les valeurs de Shapley.',
      example: {
        title: 'Prédiction du prix immobilier',
        description: 'SHAP montre comment chaque critère (superficie, localisation, etc.) contribue positivement ou négativement au prix prédit.',
        visualType: 'waterfall-chart'
      }
    }
  ];

  // Benefits of XAI
  xaiBenefits: XAIBenefit[] = [
    {
      id: 'transparency',
      title: 'Transparence Totale',
      description: 'Comprenez exactement comment vos modèles prennent leurs décisions, élément par élément.',
      icon: '🔍',
      category: 'transparency'
    },
    {
      id: 'trust',
      title: 'Confiance Renforcée',
      description: 'Validez la logique de vos modèles et identifiez les prédictions douteuses avant qu\'elles n\'impactent vos décisions.',
      icon: '🤝',
      category: 'trust'
    },
    {
      id: 'compliance',
      title: 'Conformité Réglementaire',
      description: 'Respectez les exigences de transparence (RGPD, secteur bancaire, médical) avec des explications auditables.',
      icon: '📋',
      category: 'compliance'
    },
    {
      id: 'debugging',
      title: 'Débogage Intelligent',
      description: 'Détectez les biais, erreurs de données et comportements inattendus de vos modèles rapidement.',
      icon: '🔧',
      category: 'improvement'
    },
    {
      id: 'improvement',
      title: 'Amélioration Continue',
      description: 'Optimisez vos modèles en identifiant les caractéristiques les plus importantes et les moins utiles.',
      icon: '📈',
      category: 'improvement'
    },
    {
      id: 'communication',
      title: 'Communication Facilitée',
      description: 'Présentez vos résultats ML aux parties prenantes non-techniques avec des explications claires.',
      icon: '💬',
      category: 'trust'
    }
  ];

  // Video tutorials
  xaiVideos: XAIVideo[] = [
    {
      id: 'xai-intro',
      title: 'Introduction à l\'IA Explicable',
      duration: '4:32',
      description: 'Découvrez pourquoi l\'explicabilité est cruciale en Machine Learning et comment IBIS-X vous accompagne.',
      thumbnail: 'intro-xai',
      level: 'beginner',
      topics: ['XAI', 'Introduction', 'Importance']
    },
    {
      id: 'lime-deep-dive',
      title: 'LIME en Profondeur',
      duration: '6:15',
      description: 'Maîtrisez LIME : fonctionnement, cas d\'usage et interprétation des visualisations.',
      thumbnail: 'lime-deep',
      level: 'intermediate',
      topics: ['LIME', 'Explications locales', 'Cas pratiques']
    },
    {
      id: 'shap-masterclass',
      title: 'SHAP : Guide Complet',
      duration: '8:45',
      description: 'Explorez SHAP et les valeurs de Shapley : théorie, pratique et visualisations avancées.',
      thumbnail: 'shap-master',
      level: 'advanced',
      topics: ['SHAP', 'Théorie des jeux', 'Visualisations']
    },
    {
      id: 'practical-examples',
      title: 'Exemples Pratiques XAI',
      duration: '5:28',
      description: 'Cas d\'usage réels : médical, finance, e-commerce. Voyez XAI en action.',
      thumbnail: 'practical-xai',
      level: 'intermediate',
      topics: ['Cas d\'usage', 'Exemples réels', 'Bonnes pratiques']
    }
  ];

  // Interactive example
  interactiveExample: InteractiveExample = {
    id: 'loan-approval',
    title: 'Approbation de Prêt',
    description: 'Analysez une décision d\'approbation de crédit avec LIME et SHAP',
    inputFeatures: [
      { name: 'Revenu annuel', value: 75000, importance: 35 },
      { name: 'Score de crédit', value: 720, importance: 40 },
      { name: 'Âge', value: 35, importance: 10 },
      { name: 'Emploi stable', value: 'Oui', importance: 15 }
    ],
    prediction: {
      result: 'APPROUVÉ',
      confidence: 87,
      explanation: 'Le score de crédit élevé et le revenu stable sont les facteurs décisifs pour cette approbation.'
    }
  };

  // UI State
  selectedMethod: 'lime' | 'shap' | 'comparison' = 'lime';
  selectedVideoCategory: 'all' | 'beginner' | 'intermediate' | 'advanced' = 'all';
  isPlayingDemo = false;

  constructor(
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    // Setup animations or other post-render tasks
  }

  ngOnDestroy(): void {
    this.intervals.forEach(interval => clearInterval(interval));
  }

  // Method Selection
  selectMethod(method: 'lime' | 'shap' | 'comparison'): void {
    this.selectedMethod = method;
  }

  getMethodById(id: 'lime' | 'shap'): XAIMethod | undefined {
    return this.xaiMethods.find(method => method.id === id);
  }

  // Video Management
  selectVideoCategory(category: typeof this.selectedVideoCategory): void {
    this.selectedVideoCategory = category;
  }

  getFilteredVideos(): XAIVideo[] {
    if (this.selectedVideoCategory === 'all') {
      return this.xaiVideos;
    }
    return this.xaiVideos.filter(video => video.level === this.selectedVideoCategory);
  }

  playVideo(videoId: string): void {
    console.log('Playing video:', videoId);
    // In a real app, this would open a video player modal or navigate to video page
  }

  // Interactive Demo
  toggleDemo(): void {
    this.isPlayingDemo = !this.isPlayingDemo;
    if (this.isPlayingDemo) {
      this.runDemoAnimation();
    }
  }

  runDemoAnimation(): void {
    // Simulate an animated explanation
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= 4 || !this.isPlayingDemo) {
        clearInterval(interval);
        this.isPlayingDemo = false;
      }
      // Update demo visualization based on step
    }, 1500);

    this.intervals.push(interval);
  }

  getBenefitsByCategory(category: XAIBenefit['category']): XAIBenefit[] {
    return this.xaiBenefits.filter(benefit => benefit.category === category);
  }

  // Navigation
  navigateToXAI(): void {
    this.router.navigate(['/app/xai']);
  }

  navigateToMLPipeline(): void {
    this.router.navigate(['/app/ml-pipeline']);
  }

  startXAIExperiment(): void {
    this.router.navigate(['/app/ml-pipeline/experiments']);
  }

  openDocumentation(): void {
    // In a real app, this would open documentation in a new tab
    console.log('Opening XAI documentation');
  }
}
