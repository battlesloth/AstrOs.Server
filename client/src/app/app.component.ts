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
        router.navigate(['scripter', '47cbbb4a-0077-3568-9585-a41052a7fba1']);
        //router.navigate(['status']);
        //router.navigate(['modules']);
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
