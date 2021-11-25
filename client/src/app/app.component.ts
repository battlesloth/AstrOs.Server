import { Component, ElementRef, Renderer2, ViewChild, ViewEncapsulation } from '@angular/core';
import { AuthenticationService } from './services/auth/authentication.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  @ViewChild('sideNav', { static: false }) sideNav!: ElementRef;

  constructor(public auth: AuthenticationService,
    private renderer: Renderer2) {
      var test = 'test';
      var anoter = test + 'test';

     }

  logout() {
    this.auth.logout();
  }

  showMenu() {
    if (this.auth.isLoggedIn()) {
      this.renderer.setStyle(this.sideNav.nativeElement, 'width', '200px');
    }
  }

  closeMenu() {
    this.renderer.setStyle(this.sideNav.nativeElement, 'width', '0px');
  }
}
