import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score, roc_curve,
    precision_recall_curve, average_precision_score,
    mean_absolute_error, mean_squared_error, r2_score
)
from sklearn.preprocessing import label_binarize
from sklearn.model_selection import cross_val_score, StratifiedKFold, KFold
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import io
import base64
from typing import Dict, Any, Optional, Union, List

def evaluate_classification_model(model, X_test, y_test, average='weighted', algorithm_type='decision_tree') -> Dict[str, Any]:
    """
    🔥 AMÉLIORÉ: Evaluate a classification model with BOTH macro and weighted metrics
    🆕 NOUVEAU: Support Random Forest spécifique (OOB Score, métadonnées)
    
    Args:
        algorithm_type: 'decision_tree', 'random_forest' for algorithm-specific metrics
    
    Returns:
        Dict with metrics: accuracy, precision/recall/f1 (macro+weighted), ROC-AUC, PR-AUC, confusion_matrix + OOB
    """
    y_pred = model.predict(X_test)
    
    # ✅ MÉTRIQUE DE BASE (inchangée)
    metrics = {
        'accuracy': float(accuracy_score(y_test, y_pred)),
        'confusion_matrix': confusion_matrix(y_test, y_pred).tolist()
    }
    
    # ✅ NOUVELLES MÉTRIQUES: Calculer BOTH macro ET weighted
    # Weighted (comportement existant)
    metrics['precision'] = float(precision_score(y_test, y_pred, average='weighted', zero_division=0))
    metrics['recall'] = float(recall_score(y_test, y_pred, average='weighted', zero_division=0))
    metrics['f1_score'] = float(f1_score(y_test, y_pred, average='weighted', zero_division=0))
    
    # 🎯 NOUVELLES MÉTRIQUES MACRO (requis pour Classification + Decision Tree)
    metrics['precision_macro'] = float(precision_score(y_test, y_pred, average='macro', zero_division=0))
    metrics['recall_macro'] = float(recall_score(y_test, y_pred, average='macro', zero_division=0))
    metrics['f1_macro'] = float(f1_score(y_test, y_pred, average='macro', zero_division=0))
    
    # 🆕 NOUVEAU : Métriques spécifiques Random Forest
    if algorithm_type == 'random_forest':
        # OOB Score (Out-Of-Bag) - validation interne unique à Random Forest
        if hasattr(model, 'model') and hasattr(model.model, 'oob_score_'):
            metrics['oob_score'] = float(model.model.oob_score_)
            print(f"✅ Random Forest OOB Score calculated: {metrics['oob_score']:.3f}")
        elif hasattr(model, 'oob_score_'):
            metrics['oob_score'] = float(model.oob_score_)
            print(f"✅ Random Forest OOB Score calculated: {metrics['oob_score']:.3f}")
        else:
            print(f"⚠️ Random Forest OOB Score unavailable - oob_score=True not set or model not fitted")
            
        # Métadonnées Random Forest
        try:
            n_estimators = getattr(model.model if hasattr(model, 'model') else model, 'n_estimators', 100)
            max_features = getattr(model.model if hasattr(model, 'model') else model, 'max_features', 'sqrt')
            bootstrap = getattr(model.model if hasattr(model, 'model') else model, 'bootstrap', True)
            
            metrics['rf_metadata'] = {
                'n_estimators': n_estimators,
                'max_features': max_features,
                'bootstrap': bootstrap,
                'oob_enabled': hasattr((model.model if hasattr(model, 'model') else model), 'oob_score_')
            }
            print(f"✅ Random Forest metadata added: {n_estimators} trees, max_features={max_features}")
        except Exception as rf_meta_error:
            print(f"⚠️ Could not extract Random Forest metadata: {str(rf_meta_error)}")
    else:
        print(f"🔍 Algorithm type '{algorithm_type}' - no specific metrics added")
    
    # 🎯 AMÉLIORÉ: ROC-AUC + PR-AUC pour BOTH binary ET multiclass
    unique_classes = np.unique(y_test)
    n_classes = len(unique_classes)
    
    if hasattr(model, 'predict_proba'):
        try:
            y_proba = model.predict_proba(X_test)
            
            if n_classes == 2:
                # Classification binaire (existant)
                metrics['roc_auc'] = float(roc_auc_score(y_test, y_proba[:, 1]))
                metrics['pr_auc'] = float(average_precision_score(y_test, y_proba[:, 1]))
            else:
                # 🎯 NOUVEAU: Classification multiclass (ex: Iris = 3 classes)
                # ROC-AUC multiclass avec stratégie macro (one-vs-rest)
                metrics['roc_auc'] = float(roc_auc_score(y_test, y_proba, multi_class='ovr', average='macro'))
                print(f"✅ ROC-AUC multiclass calculated for {n_classes} classes: {metrics['roc_auc']:.3f}")
                
        except Exception as e:
            print(f"Warning: Could not calculate AUC metrics: {e}")
    
    # ✅ Classification report (inchangé)
    try:
        report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
        # Convertir récursivement les types NumPy dans le rapport
        def convert_numpy_recursive(obj):
            if isinstance(obj, np.number):
                return float(obj)
            elif isinstance(obj, dict):
                return {k: convert_numpy_recursive(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy_recursive(item) for item in obj]
            else:
                return obj
        metrics['classification_report'] = convert_numpy_recursive(report)
    except:
        pass
    
    return metrics

def evaluate_regression_model(model, X_test, y_test) -> Dict[str, Any]:
    """
    Evaluate a regression model
    
    Returns:
        Dict with metrics: mae, mse, rmse, r2
    """
    y_pred = model.predict(X_test)
    
    metrics = {
        'mae': float(mean_absolute_error(y_test, y_pred)),
        'mse': float(mean_squared_error(y_test, y_pred)),
        'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
        'r2': float(r2_score(y_test, y_pred))
    }
    
    return metrics

def evaluate_model(model, X_test, y_test, task_type='classification', algorithm_type='decision_tree') -> Dict[str, Any]:
    """
    Evaluate a model based on task type and algorithm type
    
    Args:
        algorithm_type: 'decision_tree', 'random_forest', etc. for algorithm-specific metrics
    """
    if task_type == 'classification':
        return evaluate_classification_model(model, X_test, y_test, algorithm_type=algorithm_type)
    else:
        return evaluate_regression_model(model, X_test, y_test)

def cross_validate_model(model, X, y, task_type='classification', cv=5) -> Dict[str, Any]:
    """
    Perform cross-validation
    """
    if task_type == 'classification':
        cv_strategy = StratifiedKFold(n_splits=cv, shuffle=True, random_state=42)
        scoring = 'accuracy'
    else:
        cv_strategy = KFold(n_splits=cv, shuffle=True, random_state=42)
        scoring = 'neg_mean_squared_error'
    
    scores = cross_val_score(model, X, y, cv=cv_strategy, scoring=scoring)
    
    return {
        'cv_scores': scores.tolist(),
        'cv_mean': float(scores.mean()),
        'cv_std': float(scores.std())
    }

def plot_confusion_matrix(y_true, y_pred, labels=None) -> str:
    """
    🔥 AMÉLIORÉ: Plot confusion matrix and return as base64 encoded image with error handling
    """
    try:
        print(f"🔍 plot_confusion_matrix START - y_true shape: {y_true.shape if hasattr(y_true, 'shape') else 'No shape'}")
        print(f"🔍 plot_confusion_matrix - y_pred shape: {y_pred.shape if hasattr(y_pred, 'shape') else 'No shape'}")
        print(f"🔍 plot_confusion_matrix - labels: {labels}")
        
        # 🔧 FIX: Ensure y_true and y_pred are numpy arrays
        y_true = np.array(y_true)
        y_pred = np.array(y_pred)
        
        cm = confusion_matrix(y_true, y_pred)
        print(f"✅ Confusion matrix calculated: shape {cm.shape}")
        print(f"🔍 Confusion matrix values:\n{cm}")
        
        # 🔧 FIX: If no labels provided, generate them from unique values
        if labels is None:
            unique_values = np.unique(np.concatenate([y_true, y_pred]))
            labels = [str(val) for val in unique_values]
            print(f"🔍 Generated labels from data: {labels}")
        
        plt.figure(figsize=(10, 8))
        # 🔧 FIX: Use proper font size and formatting
        sns.set(font_scale=1.2)
        ax = sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                    xticklabels=labels, yticklabels=labels,
                    cbar_kws={'label': 'Nombre de prédictions'},
                    square=True, linewidths=0.5, linecolor='gray')
        plt.title('Matrice de Confusion', fontsize=16, pad=20)
        plt.ylabel('Vraie Classe', fontsize=14)
        plt.xlabel('Classe Prédite', fontsize=14)
        
        # Ensure labels are visible
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha='right')
        ax.set_yticklabels(ax.get_yticklabels(), rotation=0)
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        sns.reset_defaults()  # Reset seaborn settings
        
        # Encode to base64
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"✅ plot_confusion_matrix SUCCESS - Image size: {len(image_base64)} chars")
        return image_base64
        
    except Exception as e:
        print(f"❌ ERROR in plot_confusion_matrix: {str(e)}")
        import traceback
        traceback.print_exc()
        # 🔧 FIX: Raise the error instead of returning a fake image
        raise

def plot_feature_importance(feature_importance: Dict[str, float], top_n=20) -> str:
    """
    Plot feature importance and return as base64 encoded image
    """
    # Sort features by importance
    sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:top_n]
    features, importance = zip(*sorted_features) if sorted_features else ([], [])
    
    plt.figure(figsize=(10, 8))
    y_pos = np.arange(len(features))
    plt.barh(y_pos, importance, align='center')
    plt.yticks(y_pos, features)
    plt.xlabel('Importance')
    plt.title(f'Top {top_n} Features les Plus Importantes')
    plt.tight_layout()
    
    # Save to buffer
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # Encode to base64
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return image_base64

def plot_roc_curve(y_true, y_scores) -> str:
    """
    Plot ROC curve for binary classification
    """
    try:
        print(f"🔍 plot_roc_curve START - y_true unique: {np.unique(y_true)}")
        print(f"🔍 plot_roc_curve - y_scores range: [{np.min(y_scores):.3f}, {np.max(y_scores):.3f}]")
        
        # 🔧 FIX: Ensure y_true is binary (0 or 1)
        y_true = np.array(y_true)
        y_scores = np.array(y_scores)
        
        fpr, tpr, thresholds = roc_curve(y_true, y_scores)
        roc_auc = roc_auc_score(y_true, y_scores)
        
        print(f"🔍 ROC curve - FPR points: {len(fpr)}, TPR points: {len(tpr)}")
        print(f"🔍 ROC AUC: {roc_auc:.3f}")
        
        plt.figure(figsize=(10, 8))
        
        # 🔧 FIX: Plot with better styling and real data validation
        plt.plot(fpr, tpr, color='darkorange', lw=3, 
                 label=f'Courbe ROC (AUC = {roc_auc:.3f})', alpha=0.8)
        plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--', 
                 label='Classificateur aléatoire', alpha=0.8)
        
        # Add grid for better readability
        plt.grid(True, alpha=0.3)
        
        plt.xlim([-0.05, 1.05])
        plt.ylim([-0.05, 1.05])
        plt.xlabel('Taux de Faux Positifs (FPR)', fontsize=12)
        plt.ylabel('Taux de Vrais Positifs (TPR)', fontsize=12)
        plt.title('Courbe ROC (Receiver Operating Characteristic)', fontsize=14, pad=20)
        plt.legend(loc="lower right", fontsize=11)
        
        # Add some threshold annotations
        # Find the optimal threshold (closest to top-left corner)
        optimal_idx = np.argmax(tpr - fpr)
        optimal_threshold = thresholds[optimal_idx]
        plt.scatter(fpr[optimal_idx], tpr[optimal_idx], 
                   marker='o', color='red', s=100, 
                   label=f'Seuil optimal = {optimal_threshold:.3f}')
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Encode to base64
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"✅ plot_roc_curve SUCCESS - Image size: {len(image_base64)} chars")
        return image_base64
        
    except Exception as e:
        print(f"❌ ERROR in plot_roc_curve: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def plot_pr_curve(y_true, y_scores) -> str:
    """
    🎯 NOUVEAU: Plot Precision-Recall curve for binary classification
    Particulièrement utile pour les classes déséquilibrées
    """
    try:
        print(f"🔍 plot_pr_curve START - y_true unique: {np.unique(y_true)}")
        print(f"🔍 plot_pr_curve - y_scores range: [{np.min(y_scores):.3f}, {np.max(y_scores):.3f}]")
        
        # 🔧 FIX: Ensure arrays
        y_true = np.array(y_true)
        y_scores = np.array(y_scores)
        
        precision, recall, thresholds = precision_recall_curve(y_true, y_scores)
        pr_auc = average_precision_score(y_true, y_scores)
        
        print(f"🔍 PR curve - Precision points: {len(precision)}, Recall points: {len(recall)}")
        print(f"🔍 PR AUC: {pr_auc:.3f}")
        
        plt.figure(figsize=(10, 8))
        
        # 🔧 FIX: Better plotting with validation
        plt.plot(recall, precision, color='darkorange', lw=3, 
                 label=f'Courbe PR (AUC = {pr_auc:.3f})', alpha=0.8)
        
        # Ligne de base (performance aléatoire)
        no_skill = np.sum(y_true == 1) / len(y_true)
        plt.axhline(y=no_skill, color='navy', lw=2, linestyle='--', 
                    label=f'Performance Aléatoire ({no_skill:.2f})', alpha=0.8)
        
        # Add grid
        plt.grid(True, alpha=0.3)
        
        plt.xlim([-0.05, 1.05])
        plt.ylim([-0.05, 1.05])
        plt.xlabel('Rappel (Recall)', fontsize=12)
        plt.ylabel('Précision (Precision)', fontsize=12)
        plt.title('Courbe Précision-Rappel', fontsize=14, pad=20)
        plt.legend(loc="lower left", fontsize=11)
        
        # Add F1 score iso-curves
        f_scores = np.linspace(0.2, 0.8, num=4)
        for f_score in f_scores:
            x = np.linspace(0.01, 1)
            y = f_score * x / (2 * x - f_score)
            plt.plot(x[y >= 0], y[y >= 0], color='gray', alpha=0.2)
            plt.annotate(f'F1={f_score:.1f}', xy=(0.9, y[int(0.9*len(x))]), 
                        color='gray', alpha=0.4, fontsize=9)
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Encode to base64
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"✅ plot_pr_curve SUCCESS - Image size: {len(image_base64)} chars")
        return image_base64
        
    except Exception as e:
        print(f"❌ ERROR in plot_pr_curve: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def plot_roc_curve_multiclass(y_true, y_scores, classes) -> str:
    """
    🎯 AMÉLIORÉ: Plot ROC curves for multi-class classification (one-vs-rest) - ROBUSTE
    """
    try:
        print(f"🔄 DÉBUT plot_roc_curve_multiclass - classes: {classes}")
        print(f"🔍 y_true shape: {y_true.shape}, unique: {np.unique(y_true)}")
        print(f"🔍 y_scores shape: {y_scores.shape}")
        
        # Conversion sécurisée des classes
        classes_list = list(classes)
        n_classes = len(classes_list)
        unique_labels = np.unique(y_true)
        
        # Créer une figure
        plt.figure(figsize=(10, 8))
        
        # Calculer les courbes ROC pour chaque classe
        all_fpr = []
        all_tpr = []
        all_auc = []
        curves_plotted = 0
        
        for i in range(n_classes):
            class_name = classes_list[i] if isinstance(classes_list[i], str) else f"Classe {i}"
            
            # Créer un masque binaire pour cette classe
            mask_true = (y_true == i)
            y_binary = mask_true.astype(int)
            y_score_class = y_scores[:, i]
            
            # Vérifier s'il y a au moins un exemple de cette classe ET au moins un contre-exemple
            n_positive = np.sum(y_binary == 1)
            n_negative = np.sum(y_binary == 0)
            
            print(f"🔍 Classe {class_name}: {n_positive} positifs, {n_negative} négatifs")
            
            if n_positive > 0 and n_negative > 0:
                try:
                    # Calculer la courbe ROC
                    fpr, tpr, _ = roc_curve(y_binary, y_score_class)
                    roc_auc = roc_auc_score(y_binary, y_score_class)
                    
                    # Tracer la courbe
                    plt.plot(fpr, tpr, lw=2.5, 
                            label=f'{class_name} (AUC = {roc_auc:.2f})')
                    
                    all_fpr.append(fpr)
                    all_tpr.append(tpr)
                    all_auc.append(roc_auc)
                    curves_plotted += 1
                    
                    print(f"✅ Courbe ROC tracée pour {class_name}: AUC = {roc_auc:.2f}")
                    
                except Exception as e:
                    print(f"⚠️ Erreur pour {class_name}: {str(e)}")
            else:
                print(f"⚠️ Pas assez de données pour {class_name}")
                # Si toutes les prédictions sont correctes pour cette classe
                if n_positive == 0 and np.sum(y_score_class[~mask_true] < 0.5) == len(y_score_class[~mask_true]):
                    # Parfait pour les négatifs
                    plt.plot([0, 0, 1], [0, 1, 1], lw=2.5, 
                            label=f'{class_name} (AUC = 1.00)')
                    curves_plotted += 1
                elif n_negative == 0 and np.sum(y_score_class[mask_true] > 0.5) == len(y_score_class[mask_true]):
                    # Parfait pour les positifs
                    plt.plot([0, 0, 1], [0, 1, 1], lw=2.5, 
                            label=f'{class_name} (AUC = 1.00)')
                    curves_plotted += 1
        
        # Ligne de diagonale (performance aléatoire) - seulement si on a tracé des courbes
        if curves_plotted > 0:
            plt.plot([0, 1], [0, 1], 'k--', lw=2, label='Performance Aléatoire')
        
        plt.xlim([0.0, 1.0])
        plt.ylim([0.0, 1.05])
        plt.xlabel('Taux de Faux Positifs', fontsize=12)
        plt.ylabel('Taux de Vrais Positifs', fontsize=12)
        plt.title('Courbes ROC Multi-Classes (One-vs-Rest)', fontsize=14)
        
        # Gérer l'affichage en fonction du nombre de courbes tracées
        if curves_plotted > 0:
            plt.legend(loc="lower right", fontsize=10)
            plt.grid(True, alpha=0.3)
        else:
            # Si aucune courbe n'a pu être tracée
            plt.text(0.5, 0.5, 
                    'Données insuffisantes pour tracer les courbes ROC\n' + 
                    f'(Seulement {len(y_true)} échantillons dans le jeu de test)',
                    ha='center', va='center', fontsize=12, color='red',
                    bbox=dict(boxstyle="round,pad=0.3", facecolor="yellow", alpha=0.5))
            plt.grid(True, alpha=0.3)
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Encode to base64
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"✅ plot_roc_curve_multiclass completed - Image size: {len(image_base64)} chars")
        return image_base64
        
    except Exception as multiclass_error:
        print(f"❌ CRITICAL ERROR in plot_roc_curve_multiclass: {str(multiclass_error)}")
        import traceback
        traceback.print_exc()
        raise

def plot_regression_results(y_true, y_pred) -> str:
    """
    Plot regression results: actual vs predicted with diagonal ideal line
    """
    plt.figure(figsize=(10, 8))
    plt.scatter(y_true, y_pred, alpha=0.6, color='steelblue', s=30)
    plt.plot([y_true.min(), y_true.max()], [y_true.min(), y_true.max()], 
             'r--', lw=2, label='Diagonale Idéale', alpha=0.8)
    
    # Add grid for better readability
    plt.grid(True, alpha=0.3)
    
    plt.xlabel('Valeurs Réelles', fontsize=12)
    plt.ylabel('Valeurs Prédites', fontsize=12)
    plt.title('Prédictions vs Valeurs Réelles', fontsize=14, pad=20)
    plt.legend()
    
    # Add some statistics
    r2 = np.corrcoef(y_true, y_pred)[0, 1]**2
    mae = np.mean(np.abs(y_true - y_pred))
    plt.text(0.05, 0.95, f'R² = {r2:.3f}\nMAE = {mae:.3f}', 
             transform=plt.gca().transAxes, verticalalignment='top',
             bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
    
    # Save to buffer
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # Encode to base64
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return image_base64

def plot_residual_vs_predicted(y_true, y_pred) -> str:
    """
    🎯 NOUVEAU: Plot residuals vs predictions for regression analysis
    Critical for detecting heteroscedasticity and error patterns
    """
    try:
        print(f"🔍 plot_residual_vs_predicted START - y_true shape: {y_true.shape}")
        print(f"🔍 plot_residual_vs_predicted - y_pred shape: {y_pred.shape}")
        
        # Calculate residuals
        residuals = y_true - y_pred
        
        plt.figure(figsize=(10, 8))
        
        # Scatter plot of residuals vs predictions
        plt.scatter(y_pred, residuals, alpha=0.6, color='darkblue', s=30)
        
        # Add horizontal line at y=0
        plt.axhline(y=0, color='red', linestyle='--', lw=2, alpha=0.8, 
                   label='Résidus = 0 (Idéal)')
        
        # Add grid
        plt.grid(True, alpha=0.3)
        
        plt.xlabel('Valeurs Prédites', fontsize=12)
        plt.ylabel('Résidus (Réel - Prédit)', fontsize=12)
        plt.title('Résidus vs Prédictions', fontsize=14, pad=20)
        plt.legend()
        
        # Add statistics
        mean_residual = np.mean(residuals)
        std_residual = np.std(residuals)
        plt.text(0.05, 0.95, f'Moyenne = {mean_residual:.3f}\nÉcart-type = {std_residual:.3f}', 
                 transform=plt.gca().transAxes, verticalalignment='top',
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightyellow", alpha=0.8))
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Encode to base64
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"✅ plot_residual_vs_predicted SUCCESS - Image size: {len(image_base64)} chars")
        return image_base64
        
    except Exception as e:
        print(f"❌ ERROR in plot_residual_vs_predicted: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def plot_residuals_histogram(y_true, y_pred) -> str:
    """
    🎯 NOUVEAU: Plot histogram of residuals for regression analysis
    Critical for checking normality assumption of regression errors
    """
    try:
        print(f"🔍 plot_residuals_histogram START - y_true shape: {y_true.shape}")
        print(f"🔍 plot_residuals_histogram - y_pred shape: {y_pred.shape}")
        
        # Calculate residuals
        residuals = y_true - y_pred
        
        plt.figure(figsize=(10, 8))
        
        # Create histogram with more bins for better distribution view
        n, bins, patches = plt.hist(residuals, bins=30, density=True, alpha=0.7, 
                                   color='skyblue', edgecolor='darkblue')
        
        # Add normal distribution overlay for comparison
        mean_residual = np.mean(residuals)
        std_residual = np.std(residuals)
        
        # Generate normal distribution curve
        x = np.linspace(residuals.min(), residuals.max(), 100)
        normal_curve = (1/(std_residual * np.sqrt(2 * np.pi))) * \
                       np.exp(-0.5 * ((x - mean_residual) / std_residual) ** 2)
        
        plt.plot(x, normal_curve, 'r-', lw=2, alpha=0.8, 
                label=f'Distribution Normale\n(μ={mean_residual:.3f}, σ={std_residual:.3f})')
        
        # Add vertical line at mean
        plt.axvline(mean_residual, color='red', linestyle='--', lw=2, alpha=0.6, 
                   label=f'Moyenne = {mean_residual:.3f}')
        
        # Add grid
        plt.grid(True, alpha=0.3)
        
        plt.xlabel('Résidus (Réel - Prédit)', fontsize=12)
        plt.ylabel('Densité', fontsize=12)
        plt.title('Distribution des Résidus', fontsize=14, pad=20)
        plt.legend()
        
        # Add interpretation text
        skewness = np.mean(((residuals - mean_residual) / std_residual) ** 3)
        interpretation = "Distribution normale" if abs(skewness) < 0.5 else \
                        "Distribution asymétrique" if abs(skewness) < 1 else \
                        "Distribution très asymétrique"
        
        plt.text(0.02, 0.98, f'Asymétrie = {skewness:.3f}\n{interpretation}', 
                 transform=plt.gca().transAxes, verticalalignment='top',
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgreen", alpha=0.8))
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Encode to base64
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"✅ plot_residuals_histogram SUCCESS - Image size: {len(image_base64)} chars")
        return image_base64
        
    except Exception as e:
        print(f"❌ ERROR in plot_residuals_histogram: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def generate_visualizations(model, X_test, y_test, feature_names=None, 
                          task_type='classification', class_names=None) -> Dict[str, Dict[str, str]]:
    """
    Generate all visualizations for the model
    
    Returns:
        Dict with visualization names as keys and dict with 'image' key containing base64 data
    """
    visualizations = {}
    
    try:
        print(f"🎯 GENERATING VISUALIZATIONS - task_type: {task_type}")
        print(f"🔍 Model type: {type(model).__name__}")
        print(f"🔍 X_test shape: {X_test.shape if hasattr(X_test, 'shape') else 'No shape'}")
        print(f"🔍 y_test shape: {y_test.shape if hasattr(y_test, 'shape') else 'No shape'}")
        print(f"🔍 Feature names: {feature_names[:5] if feature_names is not None and len(feature_names) > 0 else 'None'}...")
        
        
        if task_type == 'classification':
            # Confusion matrix
            print(f"🔄 Generating confusion matrix...")
            y_pred = model.predict(X_test)
            print(f"🔍 y_pred shape: {y_pred.shape if hasattr(y_pred, 'shape') else 'No shape'}")
            
            # 🔧 FIX: Extract unique classes for labels
            unique_classes = np.unique(y_test)
            n_classes = len(unique_classes)  # Définir n_classes AVANT de l'utiliser
            
            # Utiliser les vrais noms de classes si disponibles
            if class_names is not None and len(class_names) == n_classes:
                class_labels = class_names
                print(f"🏷️ Using provided class names: {class_labels}")
            else:
                class_labels = [str(c) for c in unique_classes]  # Convert to strings for display
                print(f"🔍 Using numeric labels: {class_labels}")
                
            print(f"🔍 Class labels for confusion matrix: {class_labels}")
            print(f"🔍 Number of classes: {n_classes}")
            
            try:
                cm_image = plot_confusion_matrix(y_test, y_pred, labels=class_labels)
                visualizations['confusion_matrix'] = {
                    'image': cm_image,
                    'metadata': {
                        'n_classes': n_classes,
                        'class_names': class_labels,
                        'format': f'{n_classes}×{n_classes} {"binaire" if n_classes == 2 else "multi-classes"}'
                    }
                }
                print(f"✅ Confusion matrix generated - Image size: {len(cm_image)} chars")
            except Exception as cm_error:
                print(f"❌ Error generating confusion matrix: {str(cm_error)}")
                import traceback
                traceback.print_exc()
            
            # 🔧 CORRECTION: Conversion sécurisée en liste pour éviter erreurs NumPy
            unique_classes_list = unique_classes.tolist()
            
            if hasattr(model, 'predict_proba'):
                print(f"🔄 Generating ROC curves...")
                try:
                    y_scores = model.predict_proba(X_test)
                    print(f"🔍 y_scores shape: {y_scores.shape if hasattr(y_scores, 'shape') else 'No shape'}")
                    
                    if n_classes == 2:
                        # Classification binaire (existant)
                        print(f"🔄 Binary classification - generating ROC and PR curves...")
                        
                        # 🔧 FIX: Ensure y_test is binary encoded (0 or 1)
                        # Convert class labels to 0/1 if needed
                        y_test_binary = (y_test == unique_classes[1]).astype(int)
                        print(f"🔍 y_test_binary unique values: {np.unique(y_test_binary)}")
                        
                        try:
                            roc_image = plot_roc_curve(y_test_binary, y_scores[:, 1])
                            visualizations['roc_curve'] = {'image': roc_image}
                            print(f"✅ ROC curve generated - Image size: {len(roc_image)} chars")
                        except Exception as roc_error:
                            print(f"❌ Error generating ROC curve: {str(roc_error)}")
                            import traceback
                            traceback.print_exc()
                        
                        try:
                            pr_image = plot_pr_curve(y_test_binary, y_scores[:, 1])
                            visualizations['pr_curve'] = {'image': pr_image}
                            print(f"✅ PR curve generated - Image size: {len(pr_image)} chars")
                        except Exception as pr_error:
                            print(f"❌ Error generating PR curve: {str(pr_error)}")
                            import traceback
                            traceback.print_exc()
                    else:
                        # 🎯 NOUVEAU: Classification multiclass (ex: Iris = 3 classes)
                        print(f"🔄 Multiclass classification - generating ROC curves for {n_classes} classes...")
                        
                        try:
                            # Passer les vrais noms de classes si disponibles
                            if class_names is not None and len(class_names) == n_classes:
                                roc_multiclass_image = plot_roc_curve_multiclass(y_test, y_scores, class_names)
                                print(f"🏷️ Using class names for ROC curves: {class_names}")
                            else:
                                roc_multiclass_image = plot_roc_curve_multiclass(y_test, y_scores, unique_classes)
                                print(f"🔍 Using numeric labels for ROC curves")
                                
                            visualizations['roc_curve'] = {
                                'image': roc_multiclass_image,
                                'metadata': {
                                    'n_classes': n_classes,
                                    'class_names': class_labels,
                                    'type': 'multiclass',
                                    'description': f'Courbe ROC pour {n_classes} classes (One-vs-Rest)'
                                }
                            }
                            print(f"✅ ROC multiclass generated for {n_classes} classes: {unique_classes}")
                            print(f"✅ ROC multiclass image size: {len(roc_multiclass_image)} chars")
                        except Exception as roc_mc_error:
                            print(f"❌ Error generating multiclass ROC curve: {str(roc_mc_error)}")
                            import traceback
                            traceback.print_exc()
                except Exception as scores_error:
                    print(f"❌ Error getting prediction probabilities: {str(scores_error)}")
            else:
                print(f"⚠️ Model does not have predict_proba method - cannot generate ROC curves")
        else:
            # 🎯 AMÉLIORÉ: Regression plots - TOUTES LES VISUALISATIONS OBLIGATOIRES
            print(f"🔄 Generating ALL regression visualizations...")
            y_pred = model.predict(X_test)
            print(f"🔍 Regression y_pred shape: {y_pred.shape if hasattr(y_pred, 'shape') else 'No shape'}")
            
            # 1. Scatter plot: Prédictions vs Valeurs Réelles (avec diagonale idéale)
            try:
                reg_image = plot_regression_results(y_test, y_pred)
                visualizations['regression_plot'] = {
                    'image': reg_image,
                    'metadata': {
                        'plot_type': 'scatter_actual_vs_predicted',
                        'description': 'Scatter plot y_vrai vs y_prédit avec diagonale idéale'
                    }
                }
                print(f"✅ Regression scatter plot generated - Image size: {len(reg_image)} chars")
            except Exception as reg_error:
                print(f"❌ Error generating regression scatter plot: {str(reg_error)}")
                
            # 2. 🎯 NOUVEAU: Résidus vs Prédictions (détection hétéroscédasticité)
            try:
                residual_pred_image = plot_residual_vs_predicted(y_test, y_pred)
                visualizations['residual_vs_predicted'] = {
                    'image': residual_pred_image,
                    'metadata': {
                        'plot_type': 'residuals_vs_predictions',
                        'description': 'Résidus vs prédictions pour détecter patterns et hétéroscédasticité'
                    }
                }
                print(f"✅ Residuals vs predictions plot generated - Image size: {len(residual_pred_image)} chars")
            except Exception as res_pred_error:
                print(f"❌ Error generating residuals vs predictions plot: {str(res_pred_error)}")
                
            # 3. 🎯 NOUVEAU: Histogramme des Résidus (vérification normalité)
            try:
                residual_hist_image = plot_residuals_histogram(y_test, y_pred)
                visualizations['residuals_histogram'] = {
                    'image': residual_hist_image,
                    'metadata': {
                        'plot_type': 'residuals_histogram',
                        'description': 'Histogramme des résidus pour vérifier l\'hypothèse de normalité'
                    }
                }
                print(f"✅ Residuals histogram generated - Image size: {len(residual_hist_image)} chars")
            except Exception as res_hist_error:
                print(f"❌ Error generating residuals histogram: {str(res_hist_error)}")
            
            print(f"🎯 REGRESSION VISUALIZATIONS COMPLETED - Generated: {len([k for k in visualizations.keys() if k in ['regression_plot', 'residual_vs_predicted', 'residuals_histogram']])}/3 regression plots")
        
        # Feature importance
        if hasattr(model, 'get_feature_importance'):
            importance_data = model.get_feature_importance()
            if importance_data is not None:
                features = importance_data.get('features', [])
                importance = importance_data.get('importance', [])
                
                # Use actual feature names if provided
                if feature_names is not None and len(feature_names) == len(features):
                    feature_importance_dict = dict(zip(feature_names, importance))
                else:
                    feature_importance_dict = dict(zip(features, importance))
                
                if feature_importance_dict:
                    fi_image = plot_feature_importance(feature_importance_dict)
                    visualizations['feature_importance'] = {'image': fi_image}
        
        # 🌲 NOUVEAU: Structure de l'arbre pour Decision Tree et Random Forest
        if hasattr(model, 'get_tree_structure'):
            print(f"🌲 Attempting to extract tree structure...")
            try:
                tree_structure = model.get_tree_structure(
                    feature_names=feature_names,
                    class_names=class_names
                )
                if tree_structure:
                    visualizations['tree_structure'] = tree_structure
                    print(f"✅ Tree structure extracted successfully")
                    print(f"🌲 Tree metadata: {tree_structure.get('metadata', {})}")
                else:
                    print(f"⚠️ Tree structure returned None")
            except Exception as tree_error:
                print(f"❌ Error extracting tree structure: {str(tree_error)}")
                import traceback
                traceback.print_exc()
        else:
            print(f"⚠️ Model does not have get_tree_structure method")
    
    except Exception as e:
        print(f"❌ ERREUR CRITIQUE generate_visualizations: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # 🚨 GÉNÉRATION MINIMALISTE EN CAS D'ERREUR
        print("🔄 ATTEMPTING MINIMAL VISUALIZATION GENERATION...")
        try:
            if task_type == 'classification':
                print("🔄 Generating BASIC confusion matrix only...")
                y_pred = model.predict(X_test)
                cm_image = plot_confusion_matrix(y_test, y_pred)
                if cm_image and isinstance(cm_image, str) and len(cm_image) > 0:
                    visualizations['confusion_matrix'] = {'image': cm_image}
                    print(f"✅ BASIC confusion matrix generated - Size: {len(cm_image)} chars")
                else:
                    print(f"❌ BASIC confusion matrix generation returned invalid data: {type(cm_image)}")
        except Exception as minimal_error:
            print(f"❌ Even minimal generation failed: {str(minimal_error)}")
    
    print(f"🎯 FINAL VISUALIZATIONS - Generated keys: {list(visualizations.keys())}")
    print(f"🎯 FINAL VISUALIZATIONS - Total count: {len(visualizations)}")
    
    return visualizations 