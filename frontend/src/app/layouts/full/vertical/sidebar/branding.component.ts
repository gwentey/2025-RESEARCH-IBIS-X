import { Component, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CoreService } from 'src/app/services/core.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-branding',
  imports: [RouterModule, CommonModule],
  template: `
    <a routerLink="/app" class="logo">
      <img
        [src]="logoSrc"
        class="align-middle m-2"
        [style.width]="logoWidth"
        alt="logo"
      />
    </a>
  `,
})
export class BrandingComponent {
  private router = inject(Router);
  options = this.settings.getOptions();
  
  constructor(private settings: CoreService) {}

  get isAuthPage(): boolean {
    const url = this.router.url;
    return url.includes('/authentication/');
  }

  get logoSrc(): string {
    return this.isAuthPage
      ? './assets/images/logos/dark-logo-full.svg'
      : './assets/images/logos/dark-logo.svg';
  }

  get logoWidth(): string {
    return this.isAuthPage ? '400px' : '200px';
  }
}
