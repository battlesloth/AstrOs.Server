import { Component, ElementRef, Renderer2, ViewChild, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationService } from './services/auth/authentication.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  title = "AstOs"

  @ViewChild('sideNav', { static: false }) sideNav!: ElementRef;

  constructor(public auth: AuthenticationService,
    private renderer: Renderer2, private router: Router) {
      if (auth.isLoggedIn()) {
        router.navigate(['scripts']);
        //router.navigate(['status']);
      }
     }

  logout() {
    this.auth.logout();
  }

  showMenu() {
    if (this.auth.isLoggedIn()) {
      this.renderer.setStyle(this.sideNav.nativeElement, 'width', '220px');
    }
  }

  closeMenu() {
    this.renderer.setStyle(this.sideNav.nativeElement, 'width', '0px');
  }
}
