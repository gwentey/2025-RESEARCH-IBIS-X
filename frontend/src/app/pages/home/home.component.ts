import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CoreService } from '../../services/core.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit {
  private router = inject(Router);
  private coreService = inject(CoreService);
  public translate = inject(TranslateService);

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Animation des étoiles avec délais différents
    const stars = document.querySelectorAll('.youtube-decorative-stars');
    stars.forEach((star: any, index: number) => {
      star.style.animationDelay = `${index * 0.5}s`;
    });


    // Effet parallaxe subtil sur les éléments décoratifs
    document.addEventListener('mousemove', (e) => {
      const decorativeElements = document.querySelectorAll('.youtube-decorative-element');
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      
      decorativeElements.forEach((element: any, index: number) => {
        const speed = (index + 1) * 5;
        const xOffset = (x - 0.5) * speed;
        const yOffset = (y - 0.5) * speed;
        element.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
      });
    });


    // Effet de survol de la carte
    const youtubeCard = document.querySelector('.youtube-card-wrapper') as HTMLElement;
    if (youtubeCard) {
      youtubeCard.addEventListener('mouseenter', () => {
        youtubeCard.style.transform = 'scale(1.02)';
        youtubeCard.style.transition = 'transform 0.3s ease';
      });
      
      youtubeCard.addEventListener('mouseleave', () => {
        youtubeCard.style.transform = 'scale(1)';
      });
    }

    // Animation flottante pour les éléments décoratifs externes
    const decorativeStars = document.querySelectorAll('.star-1, .star-2, .plus-1');
    decorativeStars.forEach((star: any, index: number) => {
      star.style.animationDelay = `${index * 0.5}s`;
    });

    // Retirer la superposition de chargement après 2 secondes
    setTimeout(() => {
      const loadingOverlay = document.querySelector('.youtube-loading-overlay') as HTMLElement;
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
    }, 2000);
  }


  // Démarrer le pipeline - Handler pour le bouton "Commencer"
  startPipeline(): void {
    console.log('HomeComponent: startPipeline() appelé');
    console.log('Router disponible:', !!this.router);
    
    try {
      this.router.navigate(['/authentication/login'], {
        queryParams: { redirect: '/app/starter' }
      }).then(navigationResult => {
        console.log('Navigation vers /authentication/login:', navigationResult ? 'réussie' : 'échoué');
      }).catch(error => {
        console.error('Erreur lors de la navigation:', error);
      });
    } catch (error) {
      console.error('Erreur dans startPipeline():', error);
    }
  }
}
