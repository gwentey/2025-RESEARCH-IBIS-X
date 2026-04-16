import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';


interface TreeNode {
  name: string;
  condition: string;
  samples: number;
  is_leaf?: boolean;
  feature?: string;  // Nom complet de la feature (ex: "sepal_length")
  threshold?: number;
  value?: any;
  children?: TreeNode[];
  depth?: number;
  is_explanation?: boolean;
  class_name?: string;  // ✅ NOUVEAU : Vrai nom de classe (ex: "setosa", "versicolor")
}

@Component({
  selector: 'app-real-tree-visualization',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="real-tree-container" [ngClass]="algorithm + '-tree'">
      <!-- Header adaptatif selon l'algorithme -->
      <div class="tree-header">
        <div class="algorithm-badge" [ngClass]="algorithm">
          <mat-icon>{{getAlgorithmIcon()}}</mat-icon>
          <span>{{getAlgorithmTitle()}}</span>
        </div>
        <div class="metadata-info" *ngIf="metadata">
          <span class="metadata-item">
            <mat-icon>account_tree</mat-icon>
            Profondeur: {{metadata.max_depth || 'N/A'}}
          </span>
          <span class="metadata-item" *ngIf="algorithm === 'random_forest'">
            <mat-icon>park</mat-icon>
            {{metadata.n_estimators || 100}} arbres
          </span>
          <span class="metadata-item">
            <mat-icon>analytics</mat-icon>
            {{metadata.n_features || 'N/A'}} features
          </span>
        </div>
      </div>



      <!-- Vrai arbre avec données backend -->
      <div class="tree-visualization" *ngIf="processedTreeData && !isExplanation">
        <div class="tree-svg-container">
          <svg [attr.width]="svgWidth" [attr.height]="svgHeight" class="tree-svg">
            <!-- Liens entre nœuds -->
            <g class="tree-links">
              <line *ngFor="let link of treeLinks"
                    [attr.x1]="link.x1"
                    [attr.y1]="link.y1" 
                    [attr.x2]="link.x2"
                    [attr.y2]="link.y2"
                    [ngClass]="'link-' + algorithm">
              </line>
            </g>
            
            <!-- Nœuds d'arbre -->
            <g class="tree-nodes">
              <g *ngFor="let node of treeNodes" 
                 [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
                 class="tree-node"
                 [ngClass]="{'leaf-node': node.is_leaf, 'internal-node': !node.is_leaf}"
                 matTooltip="{{getNodeTooltip(node)}}"
                 matTooltipPosition="above">
                
                <!-- Rectangle du nœud avec meilleure lisibilité -->
                <rect [attr.width]="node.is_leaf ? 90 : 130"
                      [attr.height]="node.is_leaf ? 50 : 45"
                      [attr.x]="-(node.is_leaf ? 45 : 65)"
                      [attr.y]="node.is_leaf ? -25 : -22"
                      [ngClass]="node.is_leaf ? 'leaf-rect' : 'internal-rect'"
                      [class]="algorithm + '-node'"
                      rx="6" ry="6">
                </rect>
                
                <!-- Texte du nœud -->
                <text x="0" y="-5" text-anchor="middle" class="node-name">
                  {{node.name}}
                </text>
                <text x="0" y="8" text-anchor="middle" class="node-condition">
                  {{node.condition}}
                </text>
                <text x="0" y="18" text-anchor="middle" class="node-samples">
                  n={{node.samples}}
                </text>
              </g>
            </g>
          </svg>
        </div>
        
        <!-- Légende -->
        <div class="tree-legend">
          <div class="legend-item">
            <div class="legend-color internal-node"></div>
            <span>Nœuds de décision ({{getAlgorithm() === 'random_forest' ? 'Questions sur les features' : 'Tests de conditions'}})</span>
          </div>
          <div class="legend-item">
            <div class="legend-color leaf-node"></div>
            <span>Feuilles ({{taskType === 'classification' ? 'Classes prédites' : 'Valeurs prédites'}})</span>
          </div>
        </div>
      </div>

      <!-- Message d'explication si pas de vraies données -->
      <div class="explanation-message" *ngIf="isExplanation">
        <mat-icon>info</mat-icon>
        <h4>Structure non disponible</h4>
        <p>{{explanationText}}</p>
        <div class="suggestion">
          <mat-icon>lightbulb</mat-icon>
          <span>Les vraies structures d'arbres seront extraites du modèle entraîné et affichées ici.</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .real-tree-container {
      background: #ffffff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      min-height: 400px;
    }

    .tree-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #e2e8f0;
    }

    .algorithm-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      
      &.random_forest {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }
      
      &.decision_tree {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
      }
    }

    .metadata-info {
      display: flex;
      gap: 16px;
      
      .metadata-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: #64748b;
        
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }
    }

    .training-data-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #ecfdf5, #d1fae5);
      border: 1px solid #10b981;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 12px 0;
      color: #065f46;
      font-size: 14px;
      
      mat-icon {
        color: #10b981;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      
      strong {
        color: #047857;
      }
    }

    .tree-visualization {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .tree-svg-container {
      width: 100% !important; // 🔧 FORCE: Toujours pleine largeur
      max-width: none !important; // 🔧 SUPPRIMÉ: Pas de limite de largeur 
      overflow: auto;
      display: block; // 🆕 NOUVEAU: Force block layout
    }

    .tree-svg {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      width: 100% !important; // 🔧 FORCE: SVG pleine largeur
      height: auto !important; // 🔧 FORCE: Hauteur automatique
    }

    .tree-links line {
      stroke: #64748b;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-dasharray: 6,3;
      opacity: 0.8;
      
      &.link-random_forest {
        stroke: #059669;
        opacity: 0.9;
      }
      
      &.link-decision_tree {
        stroke: #2563eb;
        opacity: 0.9;
      }
    }

    .tree-node {
      cursor: pointer;
      transition: all 0.3s ease;
      
      &:hover {
        filter: brightness(1.1);
      }
      
      .internal-rect {
        fill: #3b82f6;
        stroke: #1e40af;
        stroke-width: 2.5;
        filter: drop-shadow(0 2px 6px rgba(59, 130, 246, 0.25));
        
        &.random_forest-node {
          fill: #2563eb;
          stroke: #1d4ed8;
        }
      }
      
      .leaf-rect {
        fill: #10b981;
        stroke: #047857;
        stroke-width: 2.5;
        filter: drop-shadow(0 2px 6px rgba(16, 185, 129, 0.25));
        
        &.random_forest-node {
          fill: #059669;
          stroke: #065f46;
        }
      }
      
      .node-name {
        fill: white;
        font-weight: 700;
        font-size: 13px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }
      
      .node-condition {
        fill: white;
        font-size: 11px;
        font-weight: 500;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
      }
      
      .node-samples {
        fill: rgba(255, 255, 255, 0.9);
        font-size: 10px;
        font-weight: 500;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
      }
    }

    .tree-legend {
      margin-top: 20px;
      display: flex;
      justify-content: center;
      gap: 24px;
      
      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #64748b;
        
        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 2px solid;
          
          &.internal-node {
            background: #667eea;
            border-color: #4f46e5;
          }
          
          &.leaf-node {
            background: #10b981;
            border-color: #059669;
          }
        }
      }
    }

    .explanation-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 300px;
      color: #64748b;
      
      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #94a3b8;
        margin-bottom: 16px;
      }
      
      h4 {
        font-size: 18px;
        font-weight: 600;
        margin: 0 0 8px 0;
        color: #374151;
      }
      
      p {
        font-size: 14px;
        margin: 0 0 16px 0;
        max-width: 400px;
        line-height: 1.5;
      }
      
      .suggestion {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 8px;
        color: #0369a1;
        
        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          margin: 0;
        }
        
        span {
          font-size: 13px;
        }
      }
    }

    // Responsive
    @media (max-width: 768px) {
      .metadata-info {
        flex-direction: column;
        gap: 8px;
      }
      
      .tree-legend {
        flex-direction: column;
        gap: 12px;
      }
    }
  `]
})
export class RealTreeVisualizationComponent implements OnInit, OnChanges {
  @Input() treeData?: TreeNode;
  @Input() algorithm: string = 'decision_tree';
  @Input() taskType: 'classification' | 'regression' = 'classification';
  @Input() metadata?: any;

  processedTreeData?: TreeNode;
  treeNodes: any[] = [];
  treeLinks: any[] = [];
  svgWidth = 1200; // AUGMENTÉ: Plus d'espace horizontal pour l'arbre
  svgHeight = 600; // AUGMENTÉ: Plus d'espace vertical
  
  // ✅ NOUVELLES PROPRIÉTÉS POUR DIMENSIONNEMENT ADAPTATIF
  treeDepth = 0;
  treeMaxWidth = 0;
  scaleFactor = 1;
  isExplanation = false;
  explanationText = '';

  constructor() {}

  ngOnInit() {
    this.processTreeData();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['treeData'] || changes['algorithm']) {
      this.processTreeData();
    }
  }

  getAlgorithmTitle(): string {
    switch (this.algorithm) {
      case 'random_forest':
        return 'Premier Arbre (Forêt Aléatoire)';
      case 'decision_tree':
        return 'Arbre de Décision Complet';
      default:
        return 'Structure d\'Arbre';
    }
  }

  getAlgorithmIcon(): string {
    switch (this.algorithm) {
      case 'random_forest':
        return 'park';
      case 'decision_tree':
        return 'account_tree';
      default:
        return 'psychology';
    }
  }

  processTreeData() {
    if (!this.treeData) {
      this.showExplanation('Aucune donnée d\'arbre disponible');
      return;
    }

    // Vérifier si c'est un message d'explication
    if (this.treeData.is_explanation) {
      this.showExplanation(this.treeData.condition);
      return;
    }

    // Processing authentic training data...
    
    // 🔍 LOGS DÉTAILLÉS DES VRAIES DONNÉES D'ENTRAÎNEMENT
    this.logRealTrainingData(this.treeData);

    this.isExplanation = false;
    this.processedTreeData = this.treeData;
    
    // ✅ CALCULER DIMENSIONS ADAPTATIVES AVANT LAYOUT
    this.calculateTreeDimensions();
    
    this.layoutTree();
  }

  /**
   * ✅ NOUVELLE MÉTHODE : Calculer dimensions optimales selon taille arbre
   */
  calculateTreeDimensions(): void {
    if (!this.processedTreeData) return;
    
    // Calculer profondeur et largeur maximale
    this.treeDepth = this.getTreeDepth(this.processedTreeData);
    this.treeMaxWidth = this.getTreeMaxWidth(this.processedTreeData);
    
    // Tree analysis completed
    
    // Calculer dimensions SVG optimales
    const minWidth = 800;
    const minHeight = 400;
    
    // Hauteur selon profondeur avec plus d'espacement vertical
    const calculatedHeight = Math.max(minHeight, (this.treeDepth * 160) + 150); // AUGMENTÉ: Plus d'espace vertical
    
    // ✅ AMÉLIORATION : Largeur avec espacement généreux pour éviter chevauchements
    const baseWidth = Math.max(minWidth, this.treeMaxWidth * 250); // AUGMENTÉ: Plus d'espace horizontal
    const calculatedWidth = baseWidth * 1.4; // AUGMENTÉ: 40% de marge de sécurité
    
    // Limiter les dimensions maximales et calculer zoom
    const maxWidth = 1400; // AUGMENTÉ: Largeur max plus grande
    const maxHeight = 900; // AUGMENTÉ: Hauteur max plus grande
    
    if (calculatedWidth > maxWidth || calculatedHeight > maxHeight) {
      // Zoom automatique si trop grand
      const scaleX = maxWidth / calculatedWidth;
      const scaleY = maxHeight / calculatedHeight;
      this.scaleFactor = Math.min(scaleX, scaleY, 1); // Ne jamais agrandir
      
      this.svgWidth = maxWidth;
      this.svgHeight = maxHeight;
    } else {
      this.scaleFactor = 1;
      this.svgWidth = calculatedWidth;
      this.svgHeight = calculatedHeight;
    }
    
    // Adaptive sizing applied
  }
  
  /**
   * Calculer profondeur maximale de l'arbre
   */
  getTreeDepth(node: TreeNode, currentDepth = 0): number {
    if (!node.children || node.children.length === 0) {
      return currentDepth;
    }
    
    let maxDepth = currentDepth;
    for (const child of node.children) {
      maxDepth = Math.max(maxDepth, this.getTreeDepth(child, currentDepth + 1));
    }
    
    return maxDepth + 1;
  }
  
  /**
   * Calculer nombre maximum de nœuds par niveau
   */
  getTreeMaxWidth(node: TreeNode): number {
    const levelCounts: number[] = [];
    this.countNodesPerLevel(node, 0, levelCounts);
    return Math.max(...levelCounts);
  }
  
  /**
   * Compter nombre de nœuds par niveau
   */
  countNodesPerLevel(node: TreeNode, level: number, levelCounts: number[]): void {
    if (!levelCounts[level]) {
      levelCounts[level] = 0;
    }
    levelCounts[level]++;
    
    if (node.children) {
      for (const child of node.children) {
        this.countNodesPerLevel(child, level + 1, levelCounts);
      }
    }
  }

  /**
   * ✅ ALGORITHME INTELLIGENT : Layout d'arbre sans chevauchement
   */
  calculateSmartTreeLayout(): void {
    if (!this.processedTreeData) return;
    
    // Étape 1 : Calculer la largeur nécessaire pour chaque sous-arbre
    this.calculateSubtreeWidths(this.processedTreeData);
    
    // Étape 2 : Ajuster les dimensions SVG selon la largeur calculée
    const treeRequiredWidth = (this.processedTreeData as any).subtreeWidth || 800;
    this.svgWidth = Math.max(1200, treeRequiredWidth + 200); // Largeur adaptative avec marge
    
    // Étape 3 : Positionner les nœuds sans chevauchement
    const startX = this.svgWidth / 2; // Centre horizontal dynamique
    const startY = 80; // AUGMENTÉ: Plus d'espace en haut
    this.positionNodesWithoutOverlap(this.processedTreeData, startX, startY, 0);
  }
  
  /**
   * Calculer la largeur nécessaire pour chaque sous-arbre
   */
  calculateSubtreeWidths(node: TreeNode): number {
    if (!node.children || node.children.length === 0) {
      // ✅ FEUILLE : largeur avec marge généreuse pour éviter collisions
      const nodeWidth = node.is_leaf ? 90 : 130;
      const generousMargin = 60; // AUGMENTÉ: Plus de marge pour éviter chevauchement
      (node as any).subtreeWidth = nodeWidth + generousMargin;
      return (node as any).subtreeWidth;
    }
    
    // Nœud interne : calculer largeur enfants avec espacement minimal garanti
    let totalChildrenWidth = 0;
    for (const child of node.children) {
      totalChildrenWidth += this.calculateSubtreeWidths(child);
    }
    
    // ✅ AJOUT ESPACEMENT MINIMAL entre enfants frères
    const minSpacingBetweenSiblings = 40; // AUGMENTÉ: Plus d'espacement entre frères
    const siblingSpacing = (node.children.length - 1) * minSpacingBetweenSiblings;
    totalChildrenWidth += siblingSpacing;
    
    // La largeur du sous-arbre est au minimum celle de ses enfants
    const nodeWidth = node.is_leaf ? 90 : 130;
    (node as any).subtreeWidth = Math.max(nodeWidth + 60, totalChildrenWidth); // AUGMENTÉ: Plus de marge
    
    return (node as any).subtreeWidth;
  }
  
  /**
   * Positionner les nœuds sans chevauchement
   */
  positionNodesWithoutOverlap(node: TreeNode, centerX: number, y: number, depth: number): void {
    // Appliquer le scale factor
    const scaledX = centerX * this.scaleFactor;
    const scaledY = y * this.scaleFactor;
    
    // Ajouter le nœud actuel
    const nodeWithPosition = {
      ...node,
      x: scaledX,
      y: scaledY,
      depth
    };
    this.treeNodes.push(nodeWithPosition);
    
    // Traiter les enfants s'il y en a
    if (node.children && node.children.length > 0) {
      // ✅ CALCUL AMÉLIORÉ : largeur totale avec espacement entre frères
      const totalChildrenWidth = node.children.reduce((sum, child) => sum + ((child as any).subtreeWidth || 130), 0);
      const minSpacingBetweenSiblings = 40; // AUGMENTÉ: Cohérent avec calculateSubtreeWidths
      const siblingSpacing = (node.children.length - 1) * minSpacingBetweenSiblings;
      const totalRequiredWidth = totalChildrenWidth + siblingSpacing;
      
      // Position de début pour les enfants (centrés sous le parent)
      let currentX = centerX - (totalRequiredWidth / 2);
      
      // Positioning children with guaranteed spacing
      
      // Positionner chaque enfant avec espacement garanti
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childSubtreeWidth = (child as any).subtreeWidth || 130;
        const childCenterX = currentX + (childSubtreeWidth / 2);
        const childY = y + 150; // AUGMENTÉ: Plus d'espacement vertical entre niveaux
        
        // Validation: ensure no collision between siblings
        
        // Créer le lien parent->enfant
        this.treeLinks.push({
          x1: scaledX,
          y1: scaledY + (20 * this.scaleFactor),
          x2: childCenterX * this.scaleFactor,
          y2: (childY - 20) * this.scaleFactor
        });
        
        // Récursion pour positionner l'enfant
        this.positionNodesWithoutOverlap(child, childCenterX, childY, depth + 1);
        
        // ✅ AVANCER avec espacement garanti
        currentX += childSubtreeWidth + minSpacingBetweenSiblings;
      }
    }
  }

  /**
   * 🔍 NOUVELLE MÉTHODE : Analyser et logger les vraies données d'entraînement
   */
  logRealTrainingData(node: TreeNode, depth: number = 0): void {
    const indent = '  '.repeat(depth);
    
    if (node.is_leaf) {
      // Leaf node with real class from dataset
    } else {
      // Internal node with real feature from dataset
      
      if (node.children) {
        node.children.forEach(child => this.logRealTrainingData(child, depth + 1));
      }
    }
  }

  showExplanation(message: string) {
    this.isExplanation = true;
    this.explanationText = message;
  }

  layoutTree() {
    if (!this.processedTreeData) return;

    this.treeNodes = [];
    this.treeLinks = [];
    
    // Calculate smart layout without overlapping
    this.calculateSmartTreeLayout();
  }

  calculateNodePositions(node: TreeNode, x: number, y: number, depth: number): void {
    // ✅ APPLIQUER LE SCALE FACTOR POUR ZOOM AUTOMATIQUE
    const scaledX = x * this.scaleFactor;
    const scaledY = y * this.scaleFactor;
    
    // Ajouter le nœud actuel avec positions mises à l'échelle
    const nodeWithPosition = {
      ...node,
      x: scaledX,
      y: scaledY,
      depth
    };
    this.treeNodes.push(nodeWithPosition);

    // Traiter les enfants
    if (node.children && node.children.length > 0) {
              // ✅ AMÉLIORER L'ESPACEMENT AVEC SCALE FACTOR
        const baseSpacing = Math.max(150, 400 / Math.pow(2, depth));
        const childSpacing = baseSpacing;
      const startX = x - (childSpacing * (node.children.length - 1)) / 2;
      
      node.children.forEach((child, index) => {
        const childX = startX + (index * childSpacing);
        const childY = y + 150; // AUGMENTÉ: Plus d'espace vertical cohérent
        
        // Ajouter le lien avec positions mises à l'échelle
        this.treeLinks.push({
          x1: scaledX,
          y1: scaledY + (20 * this.scaleFactor),
          x2: childX * this.scaleFactor,
          y2: (childY - 20) * this.scaleFactor
        });
        
        // Traiter récursivement
        this.calculateNodePositions(child, childX, childY, depth + 1);
      });
    }
  }

  getNodeTooltip(node: any): string {
    if (node.is_leaf) {
      // Tooltip pour les feuilles avec information sur la classe
      const classInfo = node.class_name ? `Classe: ${node.class_name}` : `Valeur: ${node.name}`;
      return `🍃 ${classInfo}\n📊 ${node.samples} échantillons\n💡 Nœud terminal de l'arbre`;
    } else {
      // Tooltip enrichi pour les nœuds internes avec vrai nom de feature
      const displayName = node.name;
      const fullFeatureName = node.feature || node.name;
      const condition = node.condition || '';
      
      // Si le nom affiché est différent du nom complet, montrer les deux
      if (displayName !== fullFeatureName && fullFeatureName.length > displayName.length) {
        return `🔍 Test: ${fullFeatureName} ${condition}\n📄 Affiché: ${displayName}\n📊 ${node.samples} échantillons concernés\n🌲 Profondeur: ${node.depth || 'N/A'}`;
      } else {
        return `🔍 Test: ${fullFeatureName} ${condition}\n📊 ${node.samples} échantillons concernés\n🌲 Profondeur: ${node.depth || 'N/A'}`;
      }
    }
  }

  getAlgorithm(): string {
    return this.algorithm || 'decision_tree';
  }
}
